# OptiTeach user manual

How a teacher uses OptiTeach through a semester. Screen names match the sidebar.

---

## 1. Sign in

Open `http://localhost:3000` (or `http://localhost:8080` when running with Docker) and sign in.
The sample data has two accounts, both with the password `admin123`:

- `faculty@optiteach.edu`: a teacher who owns CS302 Database Management Systems
- `admin@optiteach.edu`: an administrator who can see every course

New teachers can use **Create account** on the sign-in page. The theme switch at the bottom of the
sidebar changes between light, dark and projector (high contrast, large text).

## 2. Create a course and import its syllabus

1. Go to **Courses** and choose **New course**. Enter the code, title, semester, the number of
   periods and the minutes per period.
2. Choose **Import syllabus** in the dialog that follows (or open **Import syllabus** from the sidebar).
3. Drop a PDF, `.txt` or `.md` file, or paste the text. Each unit needs its own heading line, such as
   `UNIT 1: Relational Model`, followed by one line per topic: `Topic: concept, concept, concept`.
   **Try the sample syllabus** shows the expected format.
4. Check what was found: units, topics, concepts and course outcomes. Edit outcome wording if needed,
   choose whether this is a new course or replaces an existing course's syllabus, then save.

## 3. Adjust the curriculum

Open **Curriculum** to change what was imported:

- drag topics to reorder them, or move them with the arrow buttons;
- select a concept to change its name, kind, difficulty and importance;
- add or remove prerequisites (OptiTeach refuses a link that would create a loop).

The **Topic map** tab on the course page shows every concept by unit, coloured by how students did
on it. Click a concept to see what it needs first and what builds on it.

## 4. Plan the semester

**Time plan** shows how the semester's minutes are shared between topics, revision (10%) and tests
(8%). Every topic first gets the periods its syllabus estimate asks for; spare periods go to the
highest-priority topics, and if time is short the lowest-priority topics are cut first. The *Why*
column gives each topic's reason. Choose **Rebuild plan** after changing the syllabus or recording
a few classes.

## 5. Before each class

1. **Today** shows the next class: its topic, any revision the class needs first, and the period
   split into steps.
2. **Lesson plans** has one plan per period. Read it and **Approve** it, **Reject** it, or
   **Edit phases** to change the timings. Every save keeps the previous version; **History** shows
   and compares them.
3. Under **Material for this class**, attach slides, a video, a link, a dataset, a code snippet or a
   formula.
4. **Print** opens a printable copy of the plan. **Add periods to my calendar app** on the Lesson plans
   or Calendar page downloads an `.ics` file for Google Calendar or Outlook.

## 6. In class

**Start class** opens the presenter: full screen, a timer for each step, and the step's activity.
Keys: `Space` starts or pauses the timer, `J` / `→` goes to the next step and `K` / `←` to the
previous one, `E` adds five minutes to the current step, and `P` switches the projector theme.

## 7. After class

Choose **Record this class** (on Today or the Calendar). Enter the minutes actually taught and any
notes. If the topic wasn't finished, tick *Continue this topic next period*: the next period repeats it,
every later topic moves back by one, and their lesson plans are made again when you open them.

## 8. Test results

On the course page, **Test results** lists quizzes and exams. **Enter results** takes the class
average for each concept the test covered. Concepts below the course's threshold are marked weak; the
next lesson plans add revision for them, and the **Progress** tab lists them under *Things to look at*.

## 9. Sharing a course

On the course page, **People** lets the owner add another teacher as a **co-teacher** (can change
everything) or a **viewer** (can look but not change anything).
