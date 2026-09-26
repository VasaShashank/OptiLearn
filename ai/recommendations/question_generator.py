"""
Bloom's Taxonomy-Aligned Question and Rubric Generator
"""
from typing import List
from pydantic import BaseModel

class AssessmentQuestionItem(BaseModel):
    concept_name: str
    bloom_level: str
    question_type: str # 'mcq', 'short_answer', 'analytical_problem', 'code_query'
    question_text: str
    options: List[str] = [] # For MCQs
    correct_answer: str
    max_marks: float
    grading_rubric: List[str]

class QuestionGenerator:
    """
    Synthesizes formative and summative questions aligned with Bloom's Revised Taxonomy:
    Remember, Understand, Apply, Analyze, Evaluate, Create.
    """

    def generate_questions_for_concept(
        self,
        concept_name: str,
        bloom_level: str = "Apply",
        num_questions: int = 2
    ) -> List[AssessmentQuestionItem]:
        bloom_level_clean = bloom_level.capitalize()
        questions = []

        if bloom_level_clean in ["Remember", "Recall"]:
            questions.append(AssessmentQuestionItem(
                concept_name=concept_name,
                bloom_level="Remember",
                question_type="short_answer",
                question_text=f"Define {concept_name} and state its core algebraic or formal properties.",
                correct_answer=f"Formal definition of {concept_name} specifying state preservation and constraints.",
                max_marks=2.0,
                grading_rubric=[
                    "1 Mark: Accurate standard definition stated.",
                    "1 Mark: Mention of formal constraints or algebraic properties."
                ]
            ))
            questions.append(AssessmentQuestionItem(
                concept_name=concept_name,
                bloom_level="Remember",
                question_type="mcq",
                question_text=f"Which of the following statements is unconditionally TRUE regarding {concept_name}?",
                options=[
                    "It maintains structural invariants during concurrent transaction executions.",
                    "It always requires quadratic time complexity regardless of index structures.",
                    "It violates dependency preservation under 3NF synthesis.",
                    "None of the above."
                ],
                correct_answer="It maintains structural invariants during concurrent transaction executions.",
                max_marks=1.0,
                grading_rubric=["1 Mark: Correct option selected; 0 marks otherwise."]
            ))

        elif bloom_level_clean in ["Understand", "Comprehend"]:
            questions.append(AssessmentQuestionItem(
                concept_name=concept_name,
                bloom_level="Understand",
                question_type="short_answer",
                question_text=f"Contrast {concept_name} with its immediate prerequisite, explaining why naïve solutions fail.",
                correct_answer=f"Detailed comparative breakdown showing trade-offs between {concept_name} and baseline approaches.",
                max_marks=3.0,
                grading_rubric=[
                    "1.5 Marks: Clear conceptual contrast.",
                    "1.5 Marks: Explanation of edge cases where simpler mechanisms degrade."
                ]
            ))

        elif bloom_level_clean in ["Apply", "Application"]:
            questions.append(AssessmentQuestionItem(
                concept_name=concept_name,
                bloom_level="Apply",
                question_type="analytical_problem",
                question_text=f"Given a relation schema R with attributes (A, B, C, D) and functional dependencies F: apply {concept_name} to compute the minimal closure and determine candidate keys.",
                correct_answer="Step-by-step application demonstrating axiomatic closure derivation.",
                max_marks=5.0,
                grading_rubric=[
                    "2 Marks: Correct attribute closure calculations.",
                    "2 Marks: Verification of minimal superkey property.",
                    "1 Mark: Final candidate key set determination."
                ]
            ))
            questions.append(AssessmentQuestionItem(
                concept_name=concept_name,
                bloom_level="Apply",
                question_type="code_query",
                question_text=f"Write a standardized SQL query implementing {concept_name} over the sample relational schema.",
                correct_answer="SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ...",
                max_marks=4.0,
                grading_rubric=[
                    "2 Marks: Valid syntax and correct predicate logic.",
                    "2 Marks: Optimal aggregation and boundary condition handling."
                ]
            ))

        else: # Analyze / Evaluate
            questions.append(AssessmentQuestionItem(
                concept_name=concept_name,
                bloom_level="Analyze",
                question_type="analytical_problem",
                question_text=f"Critically analyze the performance and losslessness trade-offs of {concept_name} in high-throughput workloads.",
                correct_answer="Analytical proof of losslessness or dependency preservation with computational complexity analysis.",
                max_marks=6.0,
                grading_rubric=[
                    "2 Marks: Mathematical verification of lossless join.",
                    "2 Marks: Evaluation of dependency preservation.",
                    "2 Marks: Discussion of I/O cost trade-offs under B+ Tree vs Hash indexes."
                ]
            ))

        return questions[:num_questions]

question_generator = QuestionGenerator()
