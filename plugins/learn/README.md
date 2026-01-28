# Learn Plugin

The Learn plugin provides a platform for interactive code learning, including a compilation endpoint that can transform Rust code into WebAssembly (WASM).

## Features

- **Code Compilation**: A POST endpoint at `/compile` that compiles Rust code to WASM.
- **Runno Integration**: Designed to return WASM files and terminal output compatible with Runno.

## Setup Instructions

To use the compilation features of this plugin, you need to have Rust and the appropriate WASM target installed on your machine.

### 1. Install Rust

If you don't have Rust installed, follow the instructions at [rustup.rs](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Add WASM Target

The compiler uses the `wasm32-wasip1` target (formerly `wasm32-wasi`). Install it using rustup:

```bash
rustup target add wasm32-wasip1
```

### 3. Verify Installation

Ensure `cargo` is in your PATH. You can verify the target is installed by running:

```bash
rustup target list --installed
```

You should see `wasm32-wasip1` in the list.

## Usage

Start the learn plugin from the FraudeCode interface:

```
/learn
```

The API will be available at `http://localhost:3000`.

### Compile Endpoint

- **URL**: `http://localhost:3000/compile`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "language": "rust",
    "code": "fn main() { println!(\"Hello World\"); }"
  }
  ```
- **Response**: Returns JSON containing `stdout`, `stderr`, `exitCode`, and a base64 encoded `wasm` binary.
