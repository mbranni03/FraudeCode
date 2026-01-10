# Introduction to Rust

## What is Rust?
Rust is a modern systems programming language focused on safety, speed, and concurrency. It empowers developers to build fast, reliable software without sacrificing control over low‑level details.

## Common Uses
- **Systems programming** – operating systems, device drivers, and embedded firmware.
- **Web services** – high‑performance back‑ends and micro‑services (e.g., using Actix, Rocket, or Warp).
- **Command‑line tools** – fast, portable utilities.
- **Game development** – performance‑critical engines and tooling.
- **Networking** – low‑latency servers and clients.
- **Data processing** – parallel and safe data pipelines.

## Notable Features that Differentiate Rust
- **Ownership, Borrowing, and Lifetimes** – Guarantees memory safety at compile time without a garbage collector.
- **Zero‑Cost Abstractions** – High‑level constructs compile down to efficient machine code.
- **Strong, Static Type System** – Prevents many classes of bugs early.
- **Concurrency without Data Races** – The type system ensures safe concurrent code.
- **Cargo Package Manager** – Built‑in build system, dependency manager, and more.
- **Powerful Tooling** – `rustfmt` for formatting, `clippy` for linting, and `rust-analyzer` for IDE support.

---

# Setting Up Your Local Development Environment

## 1. Install Rust (via rustup)
`rustup` is the official installer and toolchain manager for Rust. It works on Windows, macOS, and Linux.

### Windows
```powershell
# Open PowerShell (preferably as Administrator) and run:
Invoke-WebRequest -Uri https://win.rustup.rs -OutFile rustup-init.exe
.\rustup-init.exe -y
```

### macOS & Linux
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```
The installer adds `cargo`, `rustc`, and `rustup` to your PATH. After installation, restart your terminal or run `source $HOME/.cargo/env`.

## 2. Verify the Installation
```bash
rustc --version   # Should show something like "rustc 1.78.0 (9c6b6d9f8 2024-04-02)"
cargo --version   # Should show the Cargo version
```
If these commands work, Rust is ready.

## 3. Install a Code Editor (recommended: Visual Studio Code)
1. Download VS Code from https://code.visualstudio.com/ and install it.
2. Inside VS Code, open the Extensions view (`Ctrl+Shift+X`).
3. Search for **"rust-analyzer"** and install it – this provides IDE features such as code completion, inline documentation, and go‑to definition.
4. (Optional) Install the **"Better TOML"** extension for editing `Cargo.toml` files.

## 4. Optional: Install Additional Tools
- **rustfmt** – automatically formats code.
  ```bash
  rustup component add rustfmt
  ```
- **Clippy** – a collection of lints to catch common mistakes.
  ```bash
  rustup component add clippy
  ```
- **LLVM tools** – useful for debugging, installed via your platform’s package manager if needed.

## 5. Create Your First Project with Cargo
```bash
# Create a new project called hello_rust
cargo new hello_rust --bin
cd hello_rust
```
Cargo generates a starter `src/main.rs` and a `Cargo.toml` manifest.

## 6. Run the Program
```bash
cargo run
```
You should see:
```
   Compiling hello_rust v0.1.0 (/path/to/hello_rust)
    Finished dev [unoptimized + debuginfo] target(s) in 0.45s
     Running `target/debug/hello_rust`
Hello, world!
```
Congratulations! You have a working Rust environment.

## 7. Next Steps
- Explore the official book: https://doc.rust-lang.org/book/
- Try the Rustlings exercises: https://github.com/rust-lang/rustlings
- Join the community on https://users.rust-lang.org/ or the Rust Discord.

---

You now have a solid foundation to start writing Rust code. Happy coding!
