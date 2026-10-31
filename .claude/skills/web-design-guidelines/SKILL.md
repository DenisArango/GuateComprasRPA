---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

Adaptación local (Vigía de Contrataciones): en vez de descargar las reglas en cada uso, se usa la copia
revisada en `guidelines.md` (tomada el 30/10/2026 de
`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`, MIT).
Para actualizarla, descargarla de nuevo, revisarla y reemplazar el archivo.

## How It Works

1. Read the rules in `guidelines.md` (this folder)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines.md`
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
