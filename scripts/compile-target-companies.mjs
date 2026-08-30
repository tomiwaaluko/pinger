#!/usr/bin/env node
/**
 * Compile a master target-company list from multiple sources.
 * Usage: node scripts/compile-target-companies.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "data", "target-companies.yaml");

// Curated high-signal companies (big tech, fintech, quant, AI, infra)
const CURATED = [
  // FAANG+ / Magnificent 7
  { name: "Google", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Alphabet", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Meta", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Amazon", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Apple", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Microsoft", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Netflix", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Nvidia", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Tesla", category: "big-tech", ats: "custom", tier: 1 },

  // Tier-1 tech / product
  { name: "Stripe", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Datadog", category: "devtools", ats: "greenhouse", tier: 1 },
  { name: "Cloudflare", category: "infra", ats: "greenhouse", tier: 1 },
  { name: "Vercel", category: "devtools", ats: "greenhouse", tier: 1 },
  { name: "Figma", category: "product", ats: "greenhouse", tier: 1 },
  { name: "Notion", category: "product", ats: "ashby", tier: 1 },
  { name: "Anthropic", category: "ai", ats: "greenhouse", tier: 1 },
  { name: "OpenAI", category: "ai", ats: "custom", tier: 1 },
  { name: "Cognition", category: "ai", ats: "ashby", tier: 1 },
  { name: "Palantir", category: "big-tech", ats: "custom", tier: 1 },
  { name: "SpaceX", category: "aerospace", ats: "greenhouse", tier: 1 },
  { name: "Anduril", category: "defense", ats: "greenhouse", tier: 1 },
  { name: "Databricks", category: "data", ats: "greenhouse", tier: 1 },
  { name: "Snowflake", category: "data", ats: "greenhouse", tier: 1 },
  { name: "MongoDB", category: "data", ats: "greenhouse", tier: 1 },
  { name: "GitLab", category: "devtools", ats: "greenhouse", tier: 1 },
  { name: "GitHub", category: "devtools", ats: "custom", tier: 1 },
  { name: "Atlassian", category: "product", ats: "custom", tier: 1 },
  { name: "Salesforce", category: "enterprise", ats: "custom", tier: 1 },
  { name: "ServiceNow", category: "enterprise", ats: "custom", tier: 1 },
  { name: "Workday", category: "enterprise", ats: "custom", tier: 1 },
  { name: "Oracle", category: "enterprise", ats: "custom", tier: 1 },
  { name: "SAP", category: "enterprise", ats: "custom", tier: 1 },
  { name: "Adobe", category: "product", ats: "custom", tier: 1 },
  { name: "Intuit", category: "fintech", ats: "custom", tier: 1 },
  { name: "Uber", category: "consumer", ats: "custom", tier: 1 },
  { name: "Lyft", category: "consumer", ats: "greenhouse", tier: 1 },
  { name: "Airbnb", category: "consumer", ats: "greenhouse", tier: 1 },
  { name: "DoorDash", category: "consumer", ats: "greenhouse", tier: 1 },
  { name: "Instacart", category: "consumer", ats: "greenhouse", tier: 1 },
  { name: "Robinhood", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Coinbase", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Block", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Square", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Plaid", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Brex", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Ramp", category: "fintech", ats: "ashby", tier: 1 },
  { name: "Chime", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "SoFi", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Affirm", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Marqeta", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Toast", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Rippling", category: "enterprise", ats: "ashby", tier: 1 },
  { name: "Scale AI", category: "ai", ats: "greenhouse", tier: 1 },
  { name: "Cohere", category: "ai", ats: "greenhouse", tier: 1 },
  { name: "Mistral AI", category: "ai", ats: "ashby", tier: 1 },
  { name: "Hugging Face", category: "ai", ats: "greenhouse", tier: 1 },
  { name: "Perplexity", category: "ai", ats: "ashby", tier: 1 },
  { name: "xAI", category: "ai", ats: "custom", tier: 1 },
  { name: "Applied Intuition", category: "autonomous", ats: "ashby", tier: 1 },
  { name: "Waymo", category: "autonomous", ats: "custom", tier: 1 },
  { name: "Cruise", category: "autonomous", ats: "greenhouse", tier: 1 },
  { name: "Aurora", category: "autonomous", ats: "greenhouse", tier: 1 },
  { name: "Nuro", category: "autonomous", ats: "greenhouse", tier: 1 },
  { name: "Roblox", category: "gaming", ats: "greenhouse", tier: 1 },
  { name: "Epic Games", category: "gaming", ats: "custom", tier: 1 },
  { name: "Riot Games", category: "gaming", ats: "greenhouse", tier: 1 },
  { name: "Discord", category: "consumer", ats: "greenhouse", tier: 1 },
  { name: "Reddit", category: "consumer", ats: "greenhouse", tier: 1 },
  { name: "Snap", category: "consumer", ats: "custom", tier: 1 },
  { name: "Pinterest", category: "consumer", ats: "greenhouse", tier: 1 },
  { name: "Spotify", category: "consumer", ats: "greenhouse", tier: 1 },
  { name: "Twilio", category: "devtools", ats: "greenhouse", tier: 1 },
  { name: "Okta", category: "security", ats: "greenhouse", tier: 1 },
  { name: "CrowdStrike", category: "security", ats: "greenhouse", tier: 1 },
  { name: "Palo Alto Networks", category: "security", ats: "workday", tier: 1 },
  { name: "Zscaler", category: "security", ats: "greenhouse", tier: 1 },
  { name: "Snyk", category: "security", ats: "greenhouse", tier: 1 },
  { name: "HashiCorp", category: "infra", ats: "greenhouse", tier: 1 },
  { name: "Confluent", category: "data", ats: "greenhouse", tier: 1 },
  { name: "Elastic", category: "data", ats: "greenhouse", tier: 1 },
  { name: "PlanetScale", category: "data", ats: "greenhouse", tier: 1 },
  { name: "Supabase", category: "data", ats: "ashby", tier: 1 },
  { name: "Neon", category: "data", ats: "greenhouse", tier: 1 },
  { name: "Cockroach Labs", category: "data", ats: "greenhouse", tier: 1 },
  { name: "Temporal", category: "infra", ats: "greenhouse", tier: 1 },
  { name: "Pulumi", category: "devtools", ats: "greenhouse", tier: 1 },
  { name: "Replit", category: "devtools", ats: "ashby", tier: 1 },
  { name: "Cursor", category: "ai", ats: "ashby", tier: 1 },
  { name: "Anysphere", category: "ai", ats: "ashby", tier: 1 },
  { name: "Sourcegraph", category: "devtools", ats: "greenhouse", tier: 1 },
  { name: "Grafana Labs", category: "devtools", ats: "greenhouse", tier: 1 },
  { name: "New Relic", category: "devtools", ats: "greenhouse", tier: 1 },
  { name: "Splunk", category: "devtools", ats: "workday", tier: 1 },
  { name: "Amplitude", category: "data", ats: "greenhouse", tier: 1 },
  { name: "Segment", category: "data", ats: "greenhouse", tier: 1 },
  { name: "PostHog", category: "devtools", ats: "ashby", tier: 1 },
  { name: "LaunchDarkly", category: "devtools", ats: "greenhouse", tier: 1 },
  { name: "Sentry", category: "devtools", ats: "greenhouse", tier: 1 },
  { name: "Linear", category: "product", ats: "ashby", tier: 1 },
  { name: "Airtable", category: "product", ats: "greenhouse", tier: 1 },
  { name: "Canva", category: "product", ats: "greenhouse", tier: 1 },
  { name: "Miro", category: "product", ats: "greenhouse", tier: 1 },
  { name: "Asana", category: "product", ats: "greenhouse", tier: 1 },
  { name: "Monday.com", category: "product", ats: "greenhouse", tier: 1 },
  { name: "Shopify", category: "ecommerce", ats: "greenhouse", tier: 1 },
  { name: "Etsy", category: "ecommerce", ats: "greenhouse", tier: 1 },
  { name: "eBay", category: "ecommerce", ats: "workday", tier: 1 },
  { name: "Walmart", category: "enterprise", ats: "workday", tier: 1 },
  { name: "Target", category: "enterprise", ats: "workday", tier: 1 },
  { name: "Costco", category: "enterprise", ats: "workday", tier: 1 },

  // Quant / trading
  { name: "Citadel", category: "quant", ats: "custom", tier: 1 },
  { name: "Citadel Securities", category: "quant", ats: "custom", tier: 1 },
  { name: "Jane Street", category: "quant", ats: "custom", tier: 1 },
  { name: "Two Sigma", category: "quant", ats: "custom", tier: 1 },
  { name: "Hudson River Trading", category: "quant", ats: "custom", tier: 1 },
  { name: "Jump Trading", category: "quant", ats: "custom", tier: 1 },
  { name: "Optiver", category: "quant", ats: "custom", tier: 1 },
  { name: "IMC Trading", category: "quant", ats: "custom", tier: 1 },
  { name: "DRW", category: "quant", ats: "custom", tier: 1 },
  { name: "Akuna Capital", category: "quant", ats: "greenhouse", tier: 1 },
  { name: "Five Rings", category: "quant", ats: "greenhouse", tier: 1 },
  { name: "Virtu Financial", category: "quant", ats: "greenhouse", tier: 1 },
  { name: "Tower Research", category: "quant", ats: "custom", tier: 1 },
  { name: "DE Shaw", category: "quant", ats: "custom", tier: 1 },
  { name: "Millennium Management", category: "quant", ats: "custom", tier: 1 },
  { name: "Point72", category: "quant", ats: "custom", tier: 1 },
  { name: "Bridgewater", category: "quant", ats: "custom", tier: 1 },
  { name: "Goldman Sachs", category: "finance", ats: "workday", tier: 1 },
  { name: "Morgan Stanley", category: "finance", ats: "workday", tier: 1 },
  { name: "JPMorgan Chase", category: "finance", ats: "workday", tier: 1 },
  { name: "Bank of America", category: "finance", ats: "workday", tier: 1 },
  { name: "Citi", category: "finance", ats: "workday", tier: 1 },
  { name: "Capital One", category: "fintech", ats: "workday", tier: 1 },
  { name: "American Express", category: "fintech", ats: "workday", tier: 1 },
  { name: "Visa", category: "fintech", ats: "workday", tier: 1 },
  { name: "Mastercard", category: "fintech", ats: "workday", tier: 1 },
  { name: "PayPal", category: "fintech", ats: "workday", tier: 1 },
  { name: "Fidelity Investments", category: "finance", ats: "workday", tier: 1 },
  { name: "BlackRock", category: "finance", ats: "workday", tier: 1 },
  { name: "Bloomberg", category: "finance", ats: "custom", tier: 1 },

  // Defense / aerospace (Workday-heavy)
  { name: "Boeing", category: "aerospace", ats: "workday", tier: 2 },
  { name: "Lockheed Martin", category: "defense", ats: "workday", tier: 2 },
  { name: "Raytheon", category: "defense", ats: "workday", tier: 2 },
  { name: "RTX", category: "defense", ats: "workday", tier: 2 },
  { name: "Northrop Grumman", category: "defense", ats: "workday", tier: 2 },
  { name: "General Dynamics", category: "defense", ats: "workday", tier: 2 },
  { name: "L3Harris", category: "defense", ats: "workday", tier: 2 },
  { name: "BAE Systems", category: "defense", ats: "workday", tier: 2 },
  { name: "Leidos", category: "defense", ats: "workday", tier: 2 },
  { name: "SAIC", category: "defense", ats: "workday", tier: 2 },
  { name: "CACI", category: "defense", ats: "workday", tier: 2 },
  { name: "Booz Allen Hamilton", category: "defense", ats: "workday", tier: 2 },

  // Semiconductors / hardware
  { name: "Intel", category: "hardware", ats: "workday", tier: 2 },
  { name: "AMD", category: "hardware", ats: "workday", tier: 2 },
  { name: "Qualcomm", category: "hardware", ats: "workday", tier: 2 },
  { name: "Broadcom", category: "hardware", ats: "workday", tier: 2 },
  { name: "Texas Instruments", category: "hardware", ats: "workday", tier: 2 },
  { name: "Micron", category: "hardware", ats: "workday", tier: 2 },
  { name: "Applied Materials", category: "hardware", ats: "workday", tier: 2 },
  { name: "Lam Research", category: "hardware", ats: "workday", tier: 2 },
  { name: "ASML", category: "hardware", ats: "workday", tier: 2 },
  { name: "Arm", category: "hardware", ats: "greenhouse", tier: 2 },
  { name: "Marvell", category: "hardware", ats: "workday", tier: 2 },
  { name: "GlobalFoundries", category: "hardware", ats: "workday", tier: 2 },

  // Telecom / networking
  { name: "Cisco", category: "networking", ats: "workday", tier: 2 },
  { name: "Juniper Networks", category: "networking", ats: "workday", tier: 2 },
  { name: "Arista Networks", category: "networking", ats: "greenhouse", tier: 2 },
  { name: "Nokia", category: "networking", ats: "workday", tier: 2 },
  { name: "Ericsson", category: "networking", ats: "workday", tier: 2 },
  { name: "Verizon", category: "telecom", ats: "workday", tier: 2 },
  { name: "AT&T", category: "telecom", ats: "workday", tier: 2 },
  { name: "T-Mobile", category: "telecom", ats: "workday", tier: 2 },

  // Enterprise / IT services
  { name: "IBM", category: "enterprise", ats: "workday", tier: 2 },
  { name: "Accenture", category: "consulting", ats: "workday", tier: 2 },
  { name: "Deloitte", category: "consulting", ats: "workday", tier: 2 },
  { name: "PwC", category: "consulting", ats: "workday", tier: 2 },
  { name: "EY", category: "consulting", ats: "workday", tier: 2 },
  { name: "KPMG", category: "consulting", ats: "workday", tier: 2 },
  { name: "Capgemini", category: "consulting", ats: "workday", tier: 2 },
  { name: "Cognizant", category: "consulting", ats: "workday", tier: 2 },
  { name: "Infosys", category: "consulting", ats: "workday", tier: 2 },
  { name: "Wipro", category: "consulting", ats: "workday", tier: 2 },
  { name: "TCS", category: "consulting", ats: "workday", tier: 2 },
  { name: "HCL Technologies", category: "consulting", ats: "workday", tier: 2 },

  // Healthcare tech
  { name: "Epic Systems", category: "healthtech", ats: "custom", tier: 2 },
  { name: "Veeva Systems", category: "healthtech", ats: "greenhouse", tier: 2 },
  { name: "Tempus", category: "healthtech", ats: "greenhouse", tier: 2 },
  { name: "Oscar Health", category: "healthtech", ats: "greenhouse", tier: 2 },
  { name: "Devoted Health", category: "healthtech", ats: "greenhouse", tier: 2 },
  { name: "Flatiron Health", category: "healthtech", ats: "greenhouse", tier: 2 },

  // Media / entertainment
  { name: "Disney", category: "media", ats: "workday", tier: 2 },
  { name: "Warner Bros Discovery", category: "media", ats: "workday", tier: 2 },
  { name: "Paramount", category: "media", ats: "workday", tier: 2 },
  { name: "Comcast", category: "media", ats: "workday", tier: 2 },
  { name: "Sony", category: "media", ats: "workday", tier: 2 },

  // Travel / hospitality tech
  { name: "Expedia", category: "travel", ats: "workday", tier: 2 },
  { name: "Booking.com", category: "travel", ats: "workday", tier: 2 },
  { name: "Airbnb", category: "travel", ats: "greenhouse", tier: 1 },

  // Automotive
  { name: "General Motors", category: "automotive", ats: "workday", tier: 2 },
  { name: "Ford", category: "automotive", ats: "workday", tier: 2 },
  { name: "Rivian", category: "automotive", ats: "greenhouse", tier: 2 },
  { name: "Lucid Motors", category: "automotive", ats: "greenhouse", tier: 2 },

  // More tier-2 tech
  { name: "Zoom", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Dropbox", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Box", category: "product", ats: "greenhouse", tier: 2 },
  { name: "DocuSign", category: "product", ats: "greenhouse", tier: 2 },
  { name: "HubSpot", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Zendesk", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Freshworks", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Zillow", category: "proptech", ats: "greenhouse", tier: 2 },
  { name: "Redfin", category: "proptech", ats: "greenhouse", tier: 2 },
  { name: "Opendoor", category: "proptech", ats: "greenhouse", tier: 2 },
  { name: "Compass", category: "proptech", ats: "greenhouse", tier: 2 },
  { name: "Flexport", category: "logistics", ats: "greenhouse", tier: 2 },
  { name: "Samsara", category: "iot", ats: "greenhouse", tier: 2 },
  { name: "Verkada", category: "security", ats: "greenhouse", tier: 2 },
  { name: "Netskope", category: "security", ats: "greenhouse", tier: 2 },
  { name: "SentinelOne", category: "security", ats: "greenhouse", tier: 2 },
  { name: "Wiz", category: "security", ats: "greenhouse", tier: 2 },
  { name: "Lacework", category: "security", ats: "greenhouse", tier: 2 },
  { name: "1Password", category: "security", ats: "greenhouse", tier: 2 },
  { name: "LastPass", category: "security", ats: "greenhouse", tier: 2 },
  { name: "Bitwarden", category: "security", ats: "greenhouse", tier: 2 },
  { name: "Cloudflare", category: "infra", ats: "greenhouse", tier: 1 },
  { name: "Fastly", category: "infra", ats: "greenhouse", tier: 2 },
  { name: "Akamai", category: "infra", ats: "workday", tier: 2 },
  { name: "DigitalOcean", category: "infra", ats: "greenhouse", tier: 2 },
  { name: "Linode", category: "infra", ats: "greenhouse", tier: 2 },
  { name: "Render", category: "infra", ats: "greenhouse", tier: 2 },
  { name: "Railway", category: "infra", ats: "ashby", tier: 2 },
  { name: "Fly.io", category: "infra", ats: "ashby", tier: 2 },
  { name: "Netlify", category: "infra", ats: "greenhouse", tier: 2 },
  { name: "Heroku", category: "infra", ats: "greenhouse", tier: 2 },
  { name: "Tailscale", category: "infra", ats: "greenhouse", tier: 2 },
  { name: "Cloudinary", category: "infra", ats: "greenhouse", tier: 2 },
  { name: "Algolia", category: "infra", ats: "greenhouse", tier: 2 },
  { name: "Auth0", category: "security", ats: "greenhouse", tier: 2 },
  { name: "Clerk", category: "security", ats: "ashby", tier: 2 },
  { name: "Stytch", category: "security", ats: "greenhouse", tier: 2 },
  { name: "WorkOS", category: "security", ats: "greenhouse", tier: 2 },
  { name: "Vanta", category: "security", ats: "greenhouse", tier: 2 },
  { name: "Drata", category: "security", ats: "greenhouse", tier: 2 },
  { name: "Loom", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Calendly", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Gong", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Outreach", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Salesloft", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Clari", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Braze", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Iterable", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Klaviyo", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Attentive", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Hightouch", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Census", category: "data", ats: "greenhouse", tier: 2 },
  { name: "dbt Labs", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Fivetran", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Airbyte", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Prefect", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Dagster", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Hex", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Mode", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Looker", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Tableau", category: "data", ats: "workday", tier: 2 },
  { name: "Domo", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Mixpanel", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Heap", category: "data", ats: "greenhouse", tier: 2 },
  { name: "FullStory", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Pendo", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Gainsight", category: "data", ats: "greenhouse", tier: 2 },
  { name: "ChurnZero", category: "data", ats: "greenhouse", tier: 2 },
  { name: "Intercom", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Zendesk", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Front", category: "product", ats: "greenhouse", tier: 2 },
  { name: "Gusto", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Deel", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Remote", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Oyster", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Lattice", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "BambooHR", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Greenhouse", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Lever", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Ashby", category: "hrtech", ats: "ashby", tier: 2 },
  { name: "Gem", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Eightfold AI", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Phenom", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "iCIMS", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Checkr", category: "hrtech", ats: "greenhouse", tier: 2 },
  { name: "Carta", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Mercury", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Brex", category: "fintech", ats: "greenhouse", tier: 1 },
  { name: "Pilot", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Bench", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Gusto", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Navan", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "TripActions", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Bill.com", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Tipalti", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Melio", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Pipe", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Clearco", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Pipe", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Upstart", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "LendingClub", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Better.com", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Blend", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Figure", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Dave", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Current", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Varo Bank", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Nubank", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Revolut", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Wise", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Klarna", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Adyen", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Checkout.com", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Mollie", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Razorpay", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "PhonePe", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Paytm", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Grab", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Gojek", category: "fintech", ats: "greenhouse", tier: 2 },
  { name: "Mercado Libre", category: "ecommerce", ats: "greenhouse", tier: 2 },
  { name: "Sea Limited", category: "gaming", ats: "greenhouse", tier: 2 },
  { name: "ByteDance", category: "big-tech", ats: "custom", tier: 1 },
  { name: "TikTok", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Alibaba", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Tencent", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Baidu", category: "big-tech", ats: "custom", tier: 1 },
  { name: "Samsung", category: "hardware", ats: "workday", tier: 1 },
  { name: "Sony", category: "hardware", ats: "workday", tier: 2 },
  { name: "LG", category: "hardware", ats: "workday", tier: 2 },
  { name: "HP", category: "hardware", ats: "workday", tier: 2 },
  { name: "Dell", category: "hardware", ats: "workday", tier: 2 },
  { name: "Lenovo", category: "hardware", ats: "workday", tier: 2 },
  { name: "HPE", category: "hardware", ats: "workday", tier: 2 },
  { name: "Pure Storage", category: "hardware", ats: "greenhouse", tier: 2 },
  { name: "NetApp", category: "hardware", ats: "workday", tier: 2 },
  { name: "Western Digital", category: "hardware", ats: "workday", tier: 2 },
  { name: "Seagate", category: "hardware", ats: "workday", tier: 2 },
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeName(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/🔥\s*/g, "")
    .replace(/🛂\s*/g, "")
    .replace(/🇺🇸\s*/g, "")
    .replace(/🔒\s*/g, "")
    .replace(/🎓\s*/g, "")
    .replace(/↳\s*/g, "");
}

function parseSimplifyJobs(text) {
  const companies = new Set();
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  const roleRe =
    /\b(software|engineer|developer|swe|sde|programmer|new grad|entry.?level|early career|university grad|college grad|associate|junior|engineer i|engineer 1|engineer ii)\b/i;
  const skipRe =
    /^(company|role|location|application|age|↳|🔥|🛂|🇺🇸|🔒|🎓|\d+d$|---|\[|http)/i;

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (!line || skipRe.test(line)) continue;
    if (!roleRe.test(next)) continue;
    // Company lines are usually short and don't look like locations
    if (/\b(CA|NY|TX|WA|MA|IL|GA|CO|VA|MD|FL|AZ|OR|MN|NJ|PA|Remote|USA)\b/.test(line) && !/inc|corp|llc|technologies|systems|labs|group/i.test(line))
      continue;
    const name = normalizeName(line);
    if (name.length > 1 && name.length < 80) companies.add(name);
  }
  return [...companies];
}

function parseApplyGuy(text) {
  const companies = new Set();
  const re = /^\| ([^|]+) \|/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = normalizeName(m[1]);
    if (name && name !== "Company" && name !== "---") companies.add(name);
  }
  return [...companies];
}

function parseGreenhouseYaml(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const companies = [];
  const blocks = normalized.split(/\n  - id:/);
  for (const block of blocks.slice(1)) {
    const id = block.match(/^ "([^"]+)"/)?.[1];
    const name = block.match(/name: "([^"]+)"/)?.[1];
    const boardToken = block.match(/boardToken: "([^"]+)"/)?.[1];
    const enabled = block.includes("enabled: true");
    if (id && name) {
      companies.push({
        id,
        name,
        ats: "greenhouse",
        boardToken,
        enabled,
        tier: 2,
        category: "tech",
        source: "greenhouse-fleet",
      });
    }
  }
  return companies;
}

function mergeCompanies(entries) {
  const bySlug = new Map();
  for (const entry of entries) {
    const slug = slugify(entry.name);
    const existing = bySlug.get(slug);
    if (!existing) {
      bySlug.set(slug, { ...entry, slug });
      continue;
    }
    bySlug.set(slug, {
      ...existing,
      ...entry,
      sources: [...new Set([...(existing.sources || [existing.source].filter(Boolean)), entry.source].filter(Boolean))],
      ats: entry.ats !== "unknown" ? entry.ats : existing.ats,
      tier: Math.min(entry.tier ?? 3, existing.tier ?? 3),
    });
  }
  return [...bySlug.values()].sort((a, b) => (a.tier ?? 3) - (b.tier ?? 3) || a.name.localeCompare(b.name));
}

function toYaml(companies) {
  const lines = [
    "# Target company list for pinger expansion (Workday + multi-ATS)",
    `# Generated: ${new Date().toISOString().slice(0, 10)}`,
    `# Total: ${companies.length} companies`,
    "#",
    "# Fields:",
    "#   slug     - stable identifier",
    "#   name     - display name",
    "#   category - industry vertical",
    "#   ats      - greenhouse | ashby | lever | workday | custom | unknown",
    "#   tier     - 1 (highest signal) | 2 | 3",
    "#   source   - where this entry came from",
    "",
    "companies:",
  ];
  for (const c of companies) {
    lines.push(`  - slug: ${c.slug}`);
    lines.push(`    name: "${c.name.replace(/"/g, '\\"')}"`);
    lines.push(`    category: ${c.category || "other"}`);
    lines.push(`    ats: ${c.ats || "unknown"}`);
    lines.push(`    tier: ${c.tier ?? 3}`);
    if (c.boardToken) lines.push(`    boardToken: ${c.boardToken}`);
    if (c.enabled !== undefined) lines.push(`    greenhouseEnabled: ${c.enabled}`);
    if (c.sources?.length) lines.push(`    sources: [${c.sources.join(", ")}]`);
    else if (c.source) lines.push(`    source: ${c.source}`);
  }
  return lines.join("\n") + "\n";
}

// Main
const entries = [];

// 1. Curated list
for (const c of CURATED) {
  entries.push({ ...c, source: "curated" });
}

// 2. Greenhouse fleet from feature branch
let ghYaml;
const ghPath = process.env.GH_COMPANIES;
if (ghPath && existsSync(ghPath)) {
  ghYaml = readFileSync(ghPath, "utf8");
} else {
  try {
    ghYaml = execSync(
      "git show origin/feat/multi-company-greenhouse:companies.yaml",
      { cwd: ROOT, encoding: "utf8" }
    );
  } catch (e) {
    console.warn("Could not read Greenhouse fleet:", e.message);
    ghYaml = null;
  }
}
if (ghYaml) {
  entries.push(...parseGreenhouseYaml(ghYaml));
}

// 3. SimplifyJobs new grad list
const simplifyPath = process.env.SIMPLIFY_JOBS || join(process.env.TEMP || "/tmp", "simplify-jobs.md");
try {
  const simplifyText = readFileSync(simplifyPath, "utf8");
  for (const name of parseSimplifyJobs(simplifyText)) {
    entries.push({ name, category: "other", ats: "unknown", tier: 3, source: "simplify-jobs" });
  }
} catch (e) {
  console.warn("Could not read SimplifyJobs:", e.message);
}

// 4. ApplyGuy list
const applyGuyPath = process.env.APPLY_GUY || join(process.env.TEMP || "/tmp", "apply-guy.md");
try {
  const applyGuyText = readFileSync(applyGuyPath, "utf8");
  for (const name of parseApplyGuy(applyGuyText)) {
    entries.push({ name, category: "other", ats: "unknown", tier: 3, source: "apply-guy" });
  }
} catch (e) {
  console.warn("Could not read ApplyGuy:", e.message);
}

const merged = mergeCompanies(entries);
const dir = dirname(OUT);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(OUT, toYaml(merged));

// Stats
const byAts = {};
const byCategory = {};
const byTier = {};
for (const c of merged) {
  byAts[c.ats] = (byAts[c.ats] || 0) + 1;
  byCategory[c.category] = (byCategory[c.category] || 0) + 1;
  byTier[c.tier] = (byTier[c.tier] || 0) + 1;
}

console.log(`\nWrote ${merged.length} companies to ${OUT}\n`);
console.log("By ATS:", byAts);
console.log("By tier:", byTier);
console.log("Top categories:", Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 15));
