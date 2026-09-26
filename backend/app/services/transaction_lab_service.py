"""
Transaction Lab: live, reproducible demonstrations of transaction properties on PostgreSQL.

Every scenario opens real, separate database connections (T1, T2), interleaves their
statements in a fixed order and records a timeline of what each one saw. They operate on
the txn_lab_accounts scratch table only (migration 0004), which is reset first.
"""
import threading
import time
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import DBAPIError

INITIAL_BALANCES = {"A": 500, "B": 300}


class Timeline:
    def __init__(self):
        self.steps: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._t0 = time.perf_counter()

    def add(self, txn: str, sql: str, result: Any = None, ok: bool = True) -> None:
        with self._lock:
            self.steps.append({
                "step": len(self.steps) + 1,
                "txn": txn,
                "sql": sql,
                "result": result,
                "ok": ok,
                "at_ms": round((time.perf_counter() - self._t0) * 1000, 1),
            })

    def run(self, conn: Connection, txn: str, sql: str, params: Optional[dict] = None,
            fetch: Optional[Callable] = None) -> Any:
        try:
            result = conn.execute(text(sql), params or {})
            value = fetch(result) if fetch else f"{result.rowcount} row(s)"
            self.add(txn, _render(sql, params), value)
            return value
        except DBAPIError as exc:
            self.add(txn, _render(sql, params), _pg_error(exc), ok=False)
            raise


def _render(sql: str, params: Optional[dict]) -> str:
    for key, value in (params or {}).items():
        sql = sql.replace(f":{key}", repr(value))
    return sql


def _pg_error(exc: DBAPIError) -> str:
    return str(exc.orig).strip().splitlines()[0]


def _balance(result) -> int:
    return result.scalar()


class TransactionLabService:
    SCENARIOS = {
        "atomicity": "Atomicity: a failed transfer leaves no partial update",
        "non_repeatable_read": "Isolation: non-repeatable read (READ COMMITTED vs REPEATABLE READ)",
        "lost_update": "Concurrency: the lost update anomaly and three ways to prevent it",
        "deadlock": "Concurrency: deadlock detection",
    }

    def list_scenarios(self) -> List[Dict[str, str]]:
        return [{"id": k, "title": v} for k, v in self.SCENARIOS.items()]

    def run(self, engine: Engine, scenario: str) -> Dict[str, Any]:
        if engine.dialect.name != "postgresql":
            raise ValueError("The Transaction Lab requires PostgreSQL")
        if scenario not in self.SCENARIOS:
            raise ValueError(f"Scenario {scenario} not found")
        self._reset(engine)
        result = getattr(self, f"_{scenario}")(engine)
        result.update({"scenario": scenario, "title": self.SCENARIOS[scenario],
                       "final_balances": self._balances(engine)})
        return result

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _reset(engine: Engine) -> None:
        with engine.begin() as conn:
            for account, balance in INITIAL_BALANCES.items():
                conn.execute(text("""
                    INSERT INTO txn_lab_accounts (id, label, balance) VALUES (:id, :label, :b)
                    ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance
                """), {"id": account, "label": f"Account {account}", "b": balance})

    @staticmethod
    def _balances(engine: Engine) -> Dict[str, int]:
        with engine.connect() as conn:
            return dict(conn.execute(text("SELECT id, balance FROM txn_lab_accounts ORDER BY id")).all())

    # ------------------------------------------------------------------ scenarios
    def _atomicity(self, engine: Engine) -> Dict[str, Any]:
        tl = Timeline()
        with engine.connect() as t1:
            tx = t1.begin()
            tl.add("T1", "BEGIN")
            tl.run(t1, "T1", "UPDATE txn_lab_accounts SET balance = balance + 800 WHERE id = 'B'")
            tl.run(t1, "T1", "SELECT balance FROM txn_lab_accounts WHERE id = 'B'", fetch=_balance)
            try:
                tl.run(t1, "T1", "UPDATE txn_lab_accounts SET balance = balance - 800 WHERE id = 'A'")
                tx.commit()
            except DBAPIError:
                tx.rollback()
                tl.add("T1", "ROLLBACK", "whole transaction undone")
        return {
            "timeline": tl.steps,
            "conclusion": (
                "Crediting B succeeded inside the transaction, but debiting A violated "
                "CHECK (balance >= 0). The rollback undid the credit too: the database never "
                "exposes half a transfer."
            ),
        }

    def _non_repeatable_read(self, engine: Engine) -> Dict[str, Any]:
        runs = []
        for level in ("READ COMMITTED", "REPEATABLE READ"):
            tl = Timeline()
            with engine.connect() as base1, engine.connect() as t2:
                t1 = base1.execution_options(isolation_level=level.replace(" ", "_"))
                tx1 = t1.begin()
                tl.add("T1", f"BEGIN ISOLATION LEVEL {level}")
                first = tl.run(t1, "T1", "SELECT balance FROM txn_lab_accounts WHERE id = 'A'", fetch=_balance)
                with t2.begin():
                    tl.add("T2", "BEGIN")
                    tl.run(t2, "T2", "UPDATE txn_lab_accounts SET balance = balance + 100 WHERE id = 'A'")
                tl.add("T2", "COMMIT")
                second = tl.run(t1, "T1", "SELECT balance FROM txn_lab_accounts WHERE id = 'A'", fetch=_balance)
                tx1.commit()
                tl.add("T1", "COMMIT")
            runs.append({"isolation_level": level, "timeline": tl.steps,
                         "first_read": first, "second_read": second, "repeatable": first == second})
            self._reset(engine)
        return {
            "runs": runs,
            "conclusion": (
                "Under READ COMMITTED each statement sees the latest committed data, so T1's two "
                "reads differ. REPEATABLE READ gives T1 one snapshot for the whole transaction, "
                "so both reads return the same value."
            ),
        }

    def _lost_update(self, engine: Engine) -> Dict[str, Any]:
        runs = []

        # 1. Read-modify-write in application code at READ COMMITTED: T1's deposit is lost
        tl = Timeline()
        with engine.connect() as t1, engine.connect() as t2:
            tx1, tx2 = t1.begin(), t2.begin()
            tl.add("T1", "BEGIN")
            tl.add("T2", "BEGIN")
            a1 = tl.run(t1, "T1", "SELECT balance FROM txn_lab_accounts WHERE id = 'A'", fetch=_balance)
            a2 = tl.run(t2, "T2", "SELECT balance FROM txn_lab_accounts WHERE id = 'A'", fetch=_balance)
            tl.run(t1, "T1", "UPDATE txn_lab_accounts SET balance = :v WHERE id = 'A'", {"v": a1 + 100})
            tx1.commit()
            tl.add("T1", "COMMIT")
            tl.run(t2, "T2", "UPDATE txn_lab_accounts SET balance = :v WHERE id = 'A'", {"v": a2 + 50})
            tx2.commit()
            tl.add("T2", "COMMIT")
        runs.append({"strategy": "Read-modify-write at READ COMMITTED", "timeline": tl.steps,
                     "expected": INITIAL_BALANCES["A"] + 150, "actual": self._balances(engine)["A"]})
        self._reset(engine)

        # 2. Same code at REPEATABLE READ: PostgreSQL detects the conflict and aborts T2
        tl = Timeline()
        with engine.connect() as b1, engine.connect() as b2:
            t1 = b1.execution_options(isolation_level="REPEATABLE_READ")
            t2 = b2.execution_options(isolation_level="REPEATABLE_READ")
            tx1, tx2 = t1.begin(), t2.begin()
            tl.add("T1", "BEGIN ISOLATION LEVEL REPEATABLE READ")
            tl.add("T2", "BEGIN ISOLATION LEVEL REPEATABLE READ")
            a1 = tl.run(t1, "T1", "SELECT balance FROM txn_lab_accounts WHERE id = 'A'", fetch=_balance)
            a2 = tl.run(t2, "T2", "SELECT balance FROM txn_lab_accounts WHERE id = 'A'", fetch=_balance)
            tl.run(t1, "T1", "UPDATE txn_lab_accounts SET balance = :v WHERE id = 'A'", {"v": a1 + 100})
            tx1.commit()
            tl.add("T1", "COMMIT")
            try:
                tl.run(t2, "T2", "UPDATE txn_lab_accounts SET balance = :v WHERE id = 'A'", {"v": a2 + 50})
                tx2.commit()
            except DBAPIError:
                tx2.rollback()
                tl.add("T2", "ROLLBACK", "application retries the transaction")
        with engine.begin() as retry:
            tl.run(retry, "T2 (retry)", "UPDATE txn_lab_accounts SET balance = balance + 50 WHERE id = 'A'")
        runs.append({"strategy": "REPEATABLE READ + retry on serialization failure", "timeline": tl.steps,
                     "expected": INITIAL_BALANCES["A"] + 150, "actual": self._balances(engine)["A"]})
        self._reset(engine)

        # 3. Let the database do the arithmetic: the row lock taken by UPDATE serialises writers
        tl = Timeline()
        with engine.connect() as t1, engine.connect() as t2:
            tx1, tx2 = t1.begin(), t2.begin()
            tl.add("T1", "BEGIN")
            tl.add("T2", "BEGIN")
            tl.run(t1, "T1", "UPDATE txn_lab_accounts SET balance = balance + 100 WHERE id = 'A'")
            tx1.commit()
            tl.add("T1", "COMMIT")
            tl.run(t2, "T2", "UPDATE txn_lab_accounts SET balance = balance + 50 WHERE id = 'A'")
            tx2.commit()
            tl.add("T2", "COMMIT")
        runs.append({"strategy": "Atomic UPDATE ... SET balance = balance + x", "timeline": tl.steps,
                     "expected": INITIAL_BALANCES["A"] + 150, "actual": self._balances(engine)["A"]})

        return {
            "runs": runs,
            "conclusion": (
                "Both transactions read 500 before either wrote, so the naive version silently "
                "loses T1's +100. REPEATABLE READ turns the anomaly into an error the application "
                "can retry; an atomic UPDATE (or SELECT ... FOR UPDATE) avoids it altogether."
            ),
        }

    def _deadlock(self, engine: Engine) -> Dict[str, Any]:
        tl = Timeline()
        barrier = threading.Barrier(2, timeout=10)
        outcome: Dict[str, str] = {}

        def worker(name: str, first: str, second: str) -> None:
            with engine.connect() as conn:
                tx = conn.begin()
                try:
                    conn.execute(text("SET LOCAL lock_timeout = '5s'"))
                    tl.add(name, "BEGIN")
                    tl.run(conn, name, f"UPDATE txn_lab_accounts SET balance = balance - 10 WHERE id = '{first}'")
                    barrier.wait()  # both now hold one row lock each
                    tl.run(conn, name, f"UPDATE txn_lab_accounts SET balance = balance + 10 WHERE id = '{second}'")
                    tx.commit()
                    tl.add(name, "COMMIT")
                    outcome[name] = "committed"
                except DBAPIError:
                    tx.rollback()
                    tl.add(name, "ROLLBACK", "chosen as deadlock victim")
                    outcome[name] = "aborted"

        threads = [threading.Thread(target=worker, args=("T1", "A", "B")),
                   threading.Thread(target=worker, args=("T2", "B", "A"))]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15)

        return {
            "timeline": sorted(tl.steps, key=lambda s: s["at_ms"]),
            "outcome": outcome,
            "conclusion": (
                "T1 holds A and waits for B while T2 holds B and waits for A. After "
                "deadlock_timeout PostgreSQL's detector finds the cycle in the wait-for graph and "
                "aborts one transaction so the other can finish. Acquiring locks in a fixed order "
                "prevents this."
            ),
        }


transaction_lab_service = TransactionLabService()
