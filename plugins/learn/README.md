# Learn Plugin

The Learn plugin provides a platform for interactive code learning, including a compilation endpoint that can transform Rust code into WebAssembly (WASM).

## Features

- **Code Compilation**: A POST endpoint at `/compile` that compiles Rust code to WASM.
- **Runno Integration**: Designed to return WASM files and terminal output compatible with Runno.

## Usage

Start the learn plugin from the FraudeCode interface:

```
/learn
```

The API will be available at `http://localhost:3000`.
