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