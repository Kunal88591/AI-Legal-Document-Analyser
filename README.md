# AI Legal Document Analyzer



## 🚩 Problem Statement

Going through legal documents manually is a tiring and time-consuming job. There are long pages filled with technical terms, and it's easy to miss out on important points or risks. With more companies and people dealing with contracts, agreements, and policies, it's becoming harder to keep up. Mistakes or delays in reviewing legal documents can even lead to serious issues. So, I thought — what if we could use AI to simplify this?

---

## 💡 Proposed Solution

The idea is to build a smart tool that can read legal documents and help us understand them better — just like a legal assistant, but automated.

**This system:**
- Picks out key details like names, dates, and locations
- Highlights risky or sensitive clauses
- Gives a short summary so we don’t have to read every word
- Works on PDFs, Word files, and plain text
- Is easy to use, even for someone without a legal background

It’s built using a mix of Java, Python, and React — each part doing its own job but working together smoothly.

---

## 🛠️ Technologies Used

| Layer        | Technology                     | Purpose                                    |
|--------------|-------------------------------|--------------------------------------------|
| Frontend     | React.js                      | Upload documents & display results         |
| Backend      | Java + Spring Boot            | API orchestration, file parsing            |
| NLP Service  | Python + Flask + SpaCy        | Entity extraction, summarization           |
| PDF Reading  | Apache PDFBox (Java), pdfplumber (Python) | Extracts text from PDF files      |
| Communication| REST APIs (JSON)              | Connects all services                      |
| Deployment   | Docker & Docker Compose       | Packaging and orchestration                |

---

## ⚙️ Working & Algorithm

**How it works:**
1. Upload a legal document (PDF or DOCX) via the web interface.
2. Backend extracts the raw text from the file.
3. Text is sent to the Python microservice.
4. The service uses SpaCy to pick out names, places, dates, and other legal terms.
5. It also checks for risky clauses and gives a short summary.
6. Results are shown in a clean format on the webpage.

**Algorithm Used:**
- Pre-trained SpaCy models for identifying entities
- Rule-based logic for detecting risks (like indemnity or penalty clauses)
- Simple text summarization to capture the main idea of the document

**Deployment:**
- All components run inside Docker containers
- Managed using Docker Compose for easier setup and maintenance

---

## 🚀 Future Scope

This project is just the beginning. In future versions, the AI Legal Document Analyzer can be expanded to include:

- **OCR Integration:**  
  Add Optical Character Recognition (OCR) to analyze scanned documents and images, not just digital PDFs and DOCX files.[1][2]

- **Advanced AI & LLMs:**  
  Integrate state-of-the-art AI models (like GPT-4, Gemini, Claude) for deeper clause understanding, context-aware risk detection, and even legal question answering.[1][6][11]

- **Multi-language Support:**  
  Enable analysis of documents in Hindi and other regional or international languages, making the tool useful for a wider audience.[1]

- **Cloud Deployment:**  
  Move the platform to the cloud for global, secure, and collaborative access.[1]

- **User Authentication & Multi-User Support:**  
  Add login/signup functionality for secure, personalized document management and access control.[1]

- **Clause Comparison & Playbook Review:**  
  Automatically compare uploaded contracts to standard templates, flagging deviations and non-standard terms for compliance and risk.[2][3][8][11]

- **Predictive Analytics:**  
  Use AI to forecast potential disputes, compliance issues, or business risks based on document content and historical data.[7][11]

- **Conversational AI & Q&A:**  
  Let users interact with their documents using natural language queries, asking questions and getting instant, AI-powered answers.[11]

- **Automated Drafting & Smart Templates:**  
  Generate draft contracts, agreements, or summaries automatically, with citation and precedent suggestions.[4][10][11]

- 


