## Clone Repository

```bash
git clone https://github.com/Akshatt2202/Quiz-Portal-IRT.git
cd Quiz-Portal-IRT
```

---

## Prerequisites

* Node.js 18+
* PostgreSQL
* Redis
* Python 3.10+
* pip

---

## Environment Variables

Create `backend/.env`:

```env
DATABASE_URL=""
DIRECT_URL=""
REDIS_URL=""
PORT=4000
```

Example:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/quiz_portal"
DIRECT_URL="postgresql://postgres:password@localhost:5432/quiz_portal"
REDIS_URL="redis://localhost:6379"
PORT=4000
```

---

## Database Setup

Create a PostgreSQL database:

```sql
CREATE DATABASE quiz_portal;
```

Run Prisma migrations:

```bash
cd backend

npm install

npx prisma migrate dev

npx prisma generate
```

---

## Start Redis

Linux/macOS:

```bash
redis-server
```

Docker:

```bash
docker run -p 6379:6379 redis
```

---

## Run Backend

```bash
cd backend

npm install
npm run dev
```

Backend runs on:

```text
http://localhost:4000
```

---

## Create First Admin User

```bash
curl -X POST http://localhost:4000/api/auth/register \
-H "Content-Type: application/json" \
-d '{
"name":"Admin",
"email":"admin@school.com",
"password":"admin123",
"role":"admin"
}'
```

---

## Run Frontend

```bash
cd frontend

npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:5173


```

## IRT Training

After students have completed a quiz, train the IRT model to estimate:

* **θ (Theta)** — student ability
* **a** — item discrimination
* **b** — item difficulty

### Install Python Dependencies

```bash
cd irt
pip install -r requirements.txt
```

### Dry Run

Before updating the database, run a dry run to verify the training process:

```bash
python -m irt.cli --quiz-id <QUIZ_ID> --dry-run
```

Example:

```bash
python -m irt.cli --quiz-id 12 --dry-run
```

This will calculate IRT parameters and display the results without saving them.

### Train and Save Parameters

Once you are satisfied with the output, run:

```bash
python -m irt.cli --quiz-id <QUIZ_ID>
```

Example:

```bash
python -m irt.cli --quiz-id 12
```

This command:

1. Loads student responses for the specified quiz.
2. Estimates **θ (student ability)**.
3. Estimates **a (question discrimination)**.
4. Estimates **b (question difficulty)**.
5. Saves the trained IRT parameters for use in analytics and adaptive assessment features.

### Full Workflow

```bash
# 1. Students complete a quiz

# 2. Train IRT model
cd irt
pip install -r requirements.txt

# Optional validation
python -m irt.cli --quiz-id <QUIZ_ID> --dry-run

# Train and persist parameters
python -m irt.cli --quiz-id <QUIZ_ID>
```


