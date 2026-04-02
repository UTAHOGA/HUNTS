Cloudflare Split Upload Package

Upload these assets to your Cloudflare JSON bucket or worker origin:
- hunt_research_2026_split/hunt_research_2026.index.json
- hunt_research_2026_split/manifest.json
- hunt_research_2026_split/hunts/*.json

Page behavior:
- Hunt Research loads the lightweight index first.
- Full hunt detail is fetched only when a hunt is selected.

Configured source order:
1. https://json.uoga.workers.dev/hunt_research_2026_split/hunt_research_2026.index.json
2. local ./processed_data fallback

Configured detail base order:
1. https://json.uoga.workers.dev/hunt_research_2026_split/hunts
2. local ./processed_data fallback
