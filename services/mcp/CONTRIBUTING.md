# Contributing to Gruenerator MCP

Thank you for your interest in contributing to Gruenerator MCP!

## Getting Started

### Prerequisites

- Node.js 18+
- Access to a Qdrant instance (for testing)
- Mistral API key (for embeddings)

### Development Setup

1. Clone the repository:

```bash
git clone https://github.com/Movm/Gruenerator-MCP.git
cd Gruenerator-MCP
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your credentials
```

4. Start the development server:

```bash
npm run dev
```

## How to Contribute

### Reporting Bugs

- Use the [Bug Report template](https://github.com/Movm/Gruenerator-MCP/issues/new?template=bug_report.md)
- Include steps to reproduce
- Include relevant logs and environment info

### Suggesting Features

- Use the [Feature Request template](https://github.com/Movm/Gruenerator-MCP/issues/new?template=feature_request.md)
- Describe the use case and proposed solution

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Ensure the Docker build succeeds (`docker build -t test .`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Code Style

- Use ES modules (`import`/`export`)
- Use meaningful variable and function names
- Keep functions focused and small
- Add comments for complex logic

## Questions?

Feel free to open an issue for any questions.
