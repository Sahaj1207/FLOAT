# Contributing to FLOAT

Thank you for your interest in contributing to FLOAT! We welcome bug reports, feature suggestions, documentation improvements, and code contributions.

---

## 🛠️ Getting Started

1. **Fork the Repository**: Create a fork of the repository on GitHub.
2. **Clone Your Fork**:
   ```bash
   git clone https://github.com/<your-username>/FLOAT.git
   cd FLOAT
   ```
3. **Install Dependencies**:
   ```powershell
   npm install
   ```

---

## 🌿 Branching Strategy

Always create a dedicated feature or bugfix branch based on the `main` branch. Avoid pushing experimental changes directly to `main`.

### Suggested Branch Naming
- `feature/media-improvements`
- `feature/notification-ui`
- `fix/notification-state`
- `fix/idle-timer-resets`
- `docs/update-user-guide`

```bash
git checkout -b feature/your-feature-name
```

---

## 🧪 Development & Quality Checks

Before committing and submitting your pull request, ensure all linting, type checks, and compilation passes without errors:

```powershell
# 1. Frontend TypeScript type checking
npx tsc --noEmit

# 2. Frontend production build validation
npm run build

# 3. Rust backend compilation check
cd src-tauri
cargo check
cd ..
```

---

## 📦 Pull Request Guidelines

When submitting a Pull Request (PR):

1. **Describe the Change**: Clearly explain what the PR accomplishes and why the change is necessary.
2. **Testing Performed**: Detail the manual and automated testing steps you performed (e.g. tested in compact mode, verified notification arrival, tested media session switching).
3. **Avoid Unrelated Modifications**: Keep PRs focused on a single feature or bugfix. Do not combine formatting overhauls with functional changes.
4. **Preserve Existing UX**: Ensure physical island transitions, spring physics, and timer behaviors remain consistent with FLOAT's design language.
5. **No Secrets or Credentials**: Ensure no API keys, tokens, personal certificates, or absolute machine paths are introduced.
6. **No Build Artifacts**: Ensure `.gitignore` rules are respected. Never commit binaries (`.exe`, `.msix`), `target/`, `dist/`, or temporary logs.

---

## 🎨 Code & Design Standards

- **TypeScript / React**: Use modern React 19 functional components, strict TypeScript types, and custom hooks.
- **CSS / Styling**: Maintain glassmorphism aesthetics (`backdrop-filter: blur()`, subtle border highlights, consistent CSS custom properties).
- **Rust / Tauri**: Follow standard Rust idioms, handle errors gracefully without panics in background threads, and maintain clean serialization/deserialization for IPC events.
- **Animations**: Use Framer Motion layout animations and spring physics (`stiffness: 380, damping: 34`) for physical island coherence.

---

## 📄 License

By contributing to FLOAT, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
