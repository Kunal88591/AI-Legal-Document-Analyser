# ⚖️ AI Legal Document Analyzer

A smart, AI-powered platform that reads, understands, and summarizes legal documents — making law easier, faster, and accessible for everyone.

---

## 🚩 Problem Statement

Reviewing legal documents manually is tedious, time-consuming, and prone to oversight. These documents are often filled with complex jargon, lengthy clauses, and hidden risks. For individuals and businesses alike, missing a single line can lead to major consequences.

With the increasing volume of contracts, policies, and agreements being handled daily, there is a need for an **intelligent assistant** that can simplify legal document analysis.

---

## 💡 Proposed Solution

This project aims to create a **Legal Document Analyzer** that functions like a virtual legal assistant.

### 🔍 Key Capabilities:
- Extracts critical entities like **names, dates, locations**
- **Highlights risky or sensitive clauses**
- **Summarizes** documents to convey the core meaning
- Supports **PDF, DOCX, and TXT** files
- Designed to be **simple and intuitive**, even for non-lawyers

---

## 🛠️ Tech Stack

| Layer         | Technology                               | Role / Purpose                                 |
|---------------|-------------------------------------------|------------------------------------------------|
| **Frontend**  | React.js                                  | User interface for document upload & results   |
| **Backend**   | Java + Spring Boot                        | API orchestration & file handling              |
| **NLP Engine**| Python (Flask) + SpaCy                    | Named entity extraction & summarization        |
| **File Parsing** | Apache PDFBox (Java), pdfplumber (Python) | Extracts text from legal files             |
| **Communication** | RESTful APIs (JSON)                  | Microservice interaction                        |
| **Deployment**| Docker + Docker Compose                   | Containerization and orchestration             |

---

## ⚙️ How It Works

### 📂 Step-by-Step Flow:
1. User uploads a **legal document** via the React frontend.
2. Spring Boot backend **parses the file** and sends raw text to the Python microservice.
3. Python (Flask + SpaCy) processes the content:
   - Performs **Named Entity Recognition (NER)**
   - Uses rule-based logic to detect **risky clauses**
   - Applies text summarization
4. Extracted data and insights are sent back and displayed clearly on the frontend.

---

### 🤖 Algorithms & AI Logic

- **NER using SpaCy:**  
  Pre-trained SpaCy models identify entities like names, dates, locations, etc.

- **Clause Risk Detection:**  
  Rule-based pattern matching for keywords like *"indemnity"*, *"non-compete"*, *"termination"*, etc.

- **Summarization:**  
  Extractive summarization using sentence-ranking techniques.

- **Microservices Architecture:**  
  Java and Python services communicate via REST, ensuring scalability and separation of concerns.

---

## 📦 Deployment

All components are **containerized using Docker**:

```bash
docker-compose up --build
``` 

---

## 🧩 Deployment & Ports

```bash
# Service Ports:
- Spring Boot backend: http://localhost:8080
- Flask NLP microservice: http://localhost:5000
- React frontend: http://localhost:3000

# Start everything with:
docker-compose up --build

```

🐳 Everything spins up with a single command via Docker Compose.

---

## 🚀 Future Enhancements

The following features are planned for future versions of the platform:

### 🧠 Advanced Intelligence

- ✅ **LLM Integration (GPT-4, Gemini, Claude):**  
  Enhance clause understanding and provide natural language-based legal Q&A.

- ✅ **Predictive Analytics:**  
  Analyze document history and content to predict risks, disputes, or compliance issues.

---

### 🔍 Document Expansion

- ✅ **OCR Integration:**  
  Extract text from scanned documents and images using Tesseract OCR.

- ✅ **Multi-language Support:**  
  Support for documents in Hindi, regional languages, and other global languages.

- ✅ **Clause Comparison & Playbook Matching:**  
  Automatically compare clauses with standard templates or playbooks and highlight deviations.

---

### 🧑‍💼 User & Platform Features

- ✅ **User Authentication & Profiles:**  
  Login/signup for secure access and personalized document management.

- ✅ **Cloud Deployment:**  
  Deploy the platform on AWS, GCP, or Azure for better scalability, access, and collaboration.

- ✅ **Smart Drafting System:**  
  Auto-generate drafts of agreements, summaries, and legal notes using intelligent templates.

- ✅ **Conversational AI:**  
  Let users ask document-related questions in natural language (e.g., _“Is there any termination clause?”_) and get AI-powered answers.

---

## 📎 Sample Use Case

> 📄 Upload a 12-page employment contract →  
> 🤖 Get key terms extracted, risky non-compete clause flagged, and a 6-line summary →  
> ✅ Save time, reduce risk, and make informed decisions in minutes.

---

## 📌 Conclusion

The **AI Legal Document Analyzer** is more than just a parser — it’s a step toward smarter, AI-assisted legal analysis. It empowers:

- 💼 Businesses to review contracts faster  
- 📚 Students to understand legal language better  
- 🧑‍⚖️ Lawyers to get a head start on deeper reviews  

> *"Automating legal understanding — one document at a time."*

---


**Made with ❤️ by Kunal**  
📧 [kunalmeena1311@gmail.com](mailto:kunalmeena1311@gmail.com) • 🔗 [LinkedIn](https://linkedin.com/in/kunal8859)
