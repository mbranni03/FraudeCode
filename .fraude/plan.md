# Implementation Plan

## Goal
Replace the `calculate` function in `sample/combined.py` with a quadratic‑formula implementation and add any necessary helper functions.

## Steps
1. **Add helper functions** for discriminant calculation and root computation (including import of `math`).
2. **Rewrite `calculate`** to accept parameters `a`, `b`, `c` and return the two real roots using the helpers.
3. **Update any call sites** (e.g., `run`) to provide example coefficients and handle the returned tuple.
4. **Run a quick sanity check** to ensure the script executes without errors.

## Tasks for workers
- **Worker**: Edit `sample/combined.py` according to the steps above.
- **Reviewer**: Verify the changes compile and the quadratic calculation works.
