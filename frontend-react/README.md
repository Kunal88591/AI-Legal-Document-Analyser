# Frontend React App

This package contains the user-facing dashboard for AI Legal Document Analyser.

It is built for one workflow:

1. upload a legal document
2. send it for structured analysis
3. review the findings in a high-signal dashboard
4. export or simplify the result

## What The Frontend Does

- drag and drop file upload
- jurisdiction selection
- private mode toggle
- structured summary rendering
- clause tags and risk cards
- search inside the uploaded document
- text-to-speech for the summary
- PDF export of the analysis report
- simplified plain-language output

## Main UI Files

- [src/DocumentUpload.js](src/DocumentUpload.js)
- [src/DocumentUpload.css](src/DocumentUpload.css)
- [src/App.js](src/App.js)
- [src/App.css](src/App.css)

## Run Scripts

- `npm start` - run the development server
- `npm test` - run the test runner
- `npm run build` - create a production bundle
- `npm run eject` - expose CRA internals

## Data Flow

The upload screen sends multipart form data to the backend analysis endpoint.

The response is normalized and rendered into:

- summary cards
- risk visualization
- clause tags
- highlights
- timeline entries
- quick answers

## Local Development

If you run the frontend locally, make sure it can reach the backend API used by the upload flow.

When the full stack is running through Docker Compose, the frontend and backend are meant to work together as one experience.

## Notes For Contributors

- Keep the upload flow resilient to backend error messages.
- Keep the dashboard readable even when the analysis result is sparse.
- Treat the document view and the summary view as two representations of the same source text.
