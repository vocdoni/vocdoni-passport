# Contributing to Vocdoni Passport

Thank you for your interest in contributing to Vocdoni Passport! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to abide by our code of conduct: be respectful, inclusive, and constructive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/vocdoni/vocdoni-passport/issues)
2. If not, create a new issue with:
   - A clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Device/OS information
   - Screenshots or logs if applicable

### Suggesting Features

1. Check existing issues and discussions for similar suggestions
2. Create a new issue with the "enhancement" label
3. Describe the feature and its use case
4. Explain why it would benefit users

### Pull Requests

1. Fork the repository
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes following our coding standards
4. Write or update tests as needed
5. Ensure all tests pass:
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```
6. Commit with clear, descriptive messages
7. Push to your fork and create a Pull Request

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- For Android: Docker
- For iOS: macOS with Xcode 16+

### Getting Started

```bash
# Clone the repository
git clone https://github.com/vocdoni/vocdoni-passport.git
cd vocdoni-passport

# Install dependencies
npm install --legacy-peer-deps

# Start Metro bundler
npm start

# Run on Android (requires device/emulator)
npm run android

# Run on iOS (requires macOS)
cd ios && pod install && cd ..
npm run ios
```

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow the existing code style
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### React Native

- Use functional components with hooks
- Keep components small and focused
- Use the existing component library when possible
- Follow React Native best practices

### Commit Messages

Use clear, descriptive commit messages:

```
feat: Add biometric authentication for ID access
fix: Resolve NFC scanning timeout on older devices
docs: Update README with iOS build instructions
refactor: Simplify proof generation flow
test: Add unit tests for wallet service
```

### Code Review

All submissions require review. We use GitHub pull requests for this purpose:

1. Ensure CI checks pass
2. Address reviewer feedback
3. Keep PRs focused and reasonably sized
4. Update documentation as needed

## Project Structure

```
├── src/
│   ├── components/     # Reusable UI components
│   ├── screens/        # App screens
│   ├── services/       # Business logic
│   ├── native/         # Native module bridges
│   ├── hooks/          # Custom React hooks
│   └── navigation/     # Navigation setup
├── android/            # Android native code
├── ios/                # iOS native code
└── docker/             # Build containers
```

## Testing

- Write unit tests for business logic
- Test on both Android and iOS when possible
- Include edge cases in tests
- Run the full test suite before submitting PRs

## Security

If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Email security@vocdoni.io with details
3. Allow time for the issue to be addressed before disclosure

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license.

## Questions?

- Join our [Discord](https://discord.gg/vocdoni)
- Check the [Documentation](https://docs.vocdoni.io)
- Open a [Discussion](https://github.com/vocdoni/vocdoni-passport/discussions)

Thank you for contributing! 🙏
