# TraderOS

> AI-powered F&O tax calculator for Indian retail traders.

93% of Indian F&O traders lose money every year (SEBI, 2024). Every one of them still has a tax obligation they don't understand. TraderOS takes your broker P&L file and produces a complete, ICAI 8th Edition compliant tax assessment — turnover, audit decision, ITR form, advance tax schedule, and CA-ready PDF — in under 60 seconds.

## Architecture

Three-service system:

| Service | Tech | Responsibility |
|---------|------|---------------|
| `engine/` | Python 3.12 · FastAPI · pandas | File parsing · ICAI tax calculation |
| `api/` | Java 21 · Spring Boot 3.4 · JPA | Auth · orchestration · PDF export |
| `frontend/` | Next.js 16 · TypeScript · Tailwind | User interface |

**Infrastructure:** PostgreSQL 16 · Redis 7 · Docker Compose

## Supported Brokers

- ✅ Zerodha (beta)
- 🔲 Groww (coming soon)
- 🔲 Upstox (coming soon)
- 🔲 Dhan (coming soon)

## Quick Start

```bash
git clone https://github.com/the-Sunny-Sharma/traderOS
cd traderOS
cp .env.example .env
# Add your GEMINI_API_KEY to .env
docker compose up
```

Then open:
- Frontend: http://localhost:3000
- Spring Boot API: http://localhost:8080/swagger-ui.html
- Python Engine: http://localhost:8001/docs

## Tax Rules Implemented

- **ICAI 8th Edition** turnover calculation (futures, options, intraday, delivery)
- **Section 44AB** audit eligibility (₹10 crore threshold + loss carry-forward)
- **ITR form selection** (ITR-3 for F&O/intraday, ITR-2 for delivery)
- **Section 211** advance tax quarterly schedule
- **Section 37** trader expense deductions

## License

MIT