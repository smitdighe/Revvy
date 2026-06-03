# 🚀 Revvy — AI-Powered Code Review Assistant

**Your AI pair programmer for every PR.**

> 🌐 **Live Demo:** https://revvy-iota.vercel.app  
> 🔧 **API Docs:** https://revvy-backend.onrender.com/docs

Revvy is an AI-powered code review platform that analyzes raw code snippets and GitHub Pull Requests to detect bugs, security risks, performance issues, code smells, and style problems — all with structured AI-generated feedback.

---

## 🎬 Demo Video

[![Revvy Demo](https://img.youtube.com/vi/eJBOME2-i-A/maxresdefault.jpg)](https://youtu.be/eJBOME2-i-A?si=NVzyXnGZyv-5RAiS)

> Click the thumbnail to watch the full demo on YouTube.

---

## ✨ Features

- 🔍 **AI Code Review** for code snippets
- 🔗 **GitHub PR Review** via PR URL
- ⚡ **Real-time streaming reviews** with SSE
- 🐞 Detects:
  - Bugs
  - Security vulnerabilities
  - Performance issues
  - Code smells
  - Style issues
- 📊 **Code quality scoring (0–100)**
- ✅ Verdict generation (`Approve` / `Request Changes`)
- 🎯 Severity classification
- 🎛 Review filtering by focus area

---

## 🛠️ Tech Stack

### 💻 Programming Languages
<p>
  <img src="https://skillicons.dev/icons?i=python,typescript,javascript" />
</p>

### 🌐 Frontend Development
<p>
  <img src="https://skillicons.dev/icons?i=react,vite,html,css" />
</p>

### ⚙️ Backend Development
<p>
  <img src="https://skillicons.dev/icons?i=fastapi" />
</p>

### 🤖 AI & APIs
<p>
  <img src="https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logo=groq&logoColor=white" />
  <img src="https://img.shields.io/badge/REST_API-FF6C37?style=for-the-badge&logo=postman&logoColor=white" />
</p>

### 📡 Real-Time / Networking
<p>
  <img src="https://img.shields.io/badge/SSE-Server--Sent_Events-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/PyGithub-181717?style=for-the-badge&logo=github&logoColor=white" />
  <img src="https://img.shields.io/badge/Uvicorn-499848?style=for-the-badge" />
</p>

### 🎨 UI Libraries
<p>
  <img src="https://img.shields.io/badge/Lucide_React-F56565?style=for-the-badge" />
</p>

---

## 📂 Project Structure

```bash
Revvy/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── types/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   └── main.py
│   ├── api/
│   │   ├── routes/
│   │   │   ├── health.py
│   │   │   ├── review.py
│   │   │   └── stream.py
│   │   └── dependencies.py
│   ├── core/
│   │   ├── github.py
│   │   ├── parser.py
│   │   └── reviewer.py
│   ├── schemas/
│   ├── utils/
│   ├── requirements.txt
│   └── Dockerfile
│
├── .gitignore
└── README.md
```

---

## ⚙️ Setup

### 1. Clone the repository

```bash
git clone https://github.com/smitdighe/Revvy.git
cd Revvy
```

---

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env`

```env
GROQ_API_KEY=your_key_here
GITHUB_TOKEN=your_github_token
```

Run backend:

```bash
uvicorn app.main:app --reload
```

Backend runs on:

```bash
http://localhost:8000
```

---

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```bash
http://localhost:5173
```

---

## 🔌 API Endpoints

### Health Check

```http
GET /api/v1/health
```

### Review Code

```http
POST /api/v1/review/code
```

### PR Review

```http
POST /api/v1/review/pr
```

### Export Review

```http
GET /api/v1/review/{review_id}/export
```

### Stream Review

```http
POST /api/v1/stream/code
```

---

## Example Use Cases

### Code Review

Paste code and receive:

- AI-detected issues
- Severity labels
- Suggestions
- Summary
- Quality score

### Pull Request Review

Paste GitHub PR URL and get:

- PR diff analysis
- File-level issue detection
- Verdict generation
- Review summary

