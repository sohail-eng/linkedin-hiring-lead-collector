# CV compress prompt (paste into ChatGPT / Claude / etc.)

Copy everything below the line, paste it into any AI chat, then attach or paste your full CV.
Save the AI reply exactly as `cv.md` in the `apply-workflow/` folder.

---

You are compressing a CV for a low-token job-match pipeline.

Rewrite the CV into a short markdown file. Rules:

1. Output ONLY the compressed CV markdown. No intro, no tips, no extra commentary.
2. Keep facts accurate. Do not invent employers, titles, dates, skills, or metrics.
3. Target 250–450 words max.
4. Use this exact structure and headings:

```md
# Name
- Role target: <1 short line>
- Location / work mode: <city or Remote>
- Years experience: <number or range>
- Email: <email>
- Phone: <optional>
- Links: <portfolio / LinkedIn / GitHub, optional>

## Summary
<2 short sentences max>

## Core skills
- Languages:
- Frameworks:
- Tools / cloud / DB:
- Soft / domain:

## Experience
### <Title> — <Company> (<dates>)
- <1–2 bullets: impact + stack only>

### <Title> — <Company> (<dates>)
- <1–2 bullets>

## Education
- <degree / school / year>

## Highlights
- <up to 3 short proof points that help match job posts>
```

5. Prefer nouns and concrete stack names over fluff (“passionate”, “team player”, “results-driven”).
6. Drop hobbies, references, photo notes, and long project essays unless they prove a skill.
7. If something is unknown, omit the line instead of guessing.
