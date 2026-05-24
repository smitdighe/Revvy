# 🚀 Revvy — AI-Powered Code Review Assistant

**Your AI pair programmer for every PR.**

Revvy is an AI-powered code review platform that analyzes raw code snippets and GitHub Pull Requests to detect bugs, security risks, performance issues, code smells, and style problems — all with structured AI-generated feedback.

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

## 🛠 Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Framer Motion
- Lucide React

### Backend
- FastAPI
- Google Gemini API
- PyGithub
- SSE (Server-Sent Events)
- Pydantic
- Uvicorn

---

## 📂 Project Structure

```bash
Revvy/
├── frontend/                    # React + TypeScript client
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   ├── services/            # API calls (backend integration)
│   │   ├── utils/               # Helper functions
│   │   ├── types/               # TypeScript interfaces/types
│   │   ├── App.tsx              # Main application
│   │   ├── main.tsx             # React entry point
│   │   └── index.css            # Global styles
│   ├── public/                  # Static assets
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/                     # FastAPI backend
│   ├── app/
│   │   └── main.py              # FastAPI entry point
│   ├── api/
│   │   ├── routes/              # API endpoints
│   │   └── dependencies/        # Shared dependencies
│   ├── core/
│   │   ├── reviewer.py          # AI review logic
│   │   ├── pr_parser.py         # GitHub PR parsing
│   │   └── scoring.py           # Quality scoring logic
│   ├── schemas/                # Request/response models
│   ├── utils/                  # Helper utilities
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
GEMINI_API_KEY=your_key_here
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
POST /api/v1/review
```

### Stream Review

```http
POST /api/v1/stream
```

---

## 📸 Screenshots

Add screenshots from:

```bash
frontend/screenshots/
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

---

## Future Improvements

- GitHub App integration
- Inline code comments on PRs
- Multi-model support
- Team review dashboard
- CI/CD integration

---
