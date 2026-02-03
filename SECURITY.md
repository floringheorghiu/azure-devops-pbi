# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this Figma plugin, please report it responsibly:

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please email security reports to: **florin@gheorghiu.ro**

Include the following information:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

We will respond within 48 hours and work with you to understand and address the issue promptly.

## Security Measures

This plugin implements the following security practices:

- **Encrypted PAT Storage**: Personal Access Tokens are encrypted using AES-GCM before storage
- **No Hardcoded Secrets**: All sensitive configuration is user-provided or encrypted
- **Automated Security Scanning**: CodeQL and dependency audits run on every PR
- **Minimal Permissions**: Plugin requests only necessary Figma API permissions
- **CORS Proxy**: Backend infrastructure is in a separate private repository

## Known Security Considerations

- PATs are stored in Figma's clientStorage with encryption
- The encryption key is auto-generated and stored alongside encrypted data
- Users should rotate their Azure DevOps PATs regularly
- Self-hosting the CORS proxy is recommended for production use

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who help improve this project.
