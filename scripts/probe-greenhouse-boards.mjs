#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";

const CONCURRENCY = 8;
const MAX_429_RETRIES = 2;
const API_ROOT = "https://boards-api.greenhouse.io/v1/boards";

const NAME_MAP = new Map(
  Object.entries({
    airbnb: "Airbnb",
    algolia: "Algolia",
    amplitude: "Amplitude",
    andurilindustries: "Anduril Industries",
    anthropic: "Anthropic",
    asana: "Asana",
    brex: "Brex",
    chime: "Chime",
    clickhouse: "ClickHouse",
    cloudflare: "Cloudflare",
    cockroachlabs: "Cockroach Labs",
    coinbase: "Coinbase",
    customerio: "Customer.io",
    databricks: "Databricks",
    datadog: "Datadog",
    descope: "Descope",
    discord: "Discord",
    dropbox: "Dropbox",
    duolingo: "Duolingo",
    elastic: "Elastic",
    fastly: "Fastly",
    figma: "Figma",
    gitlab: "GitLab",
    gleanwork: "Glean",
    grafanalabs: "Grafana Labs",
    honeycomb: "Honeycomb",
    inflectionai: "Inflection AI",
    instacart: "Instacart",
    intercom: "Intercom",
    jetbrains: "JetBrains",
    launchdarkly: "LaunchDarkly",
    lyft: "Lyft",
    mercury: "Mercury",
    mixpanel: "Mixpanel",
    mongodb: "MongoDB",
    mozilla: "Mozilla",
    netlify: "Netlify",
    newrelic: "New Relic",
    nuro: "Nuro",
    okta: "Okta",
    pinterest: "Pinterest",
    planetscale: "PlanetScale",
    postman: "Postman",
    prisma: "Prisma",
    reddit: "Reddit",
    roblox: "Roblox",
    robinhood: "Robinhood",
    scaleai: "Scale AI",
    spacex: "SpaceX",
    stripe: "Stripe",
    tailscale: "Tailscale",
    temporaltechnologies: "Temporal",
    togetherai: "Together AI",
    twilio: "Twilio",
    twitch: "Twitch",
    vercel: "Vercel",
    waymo: "Waymo",
    webflow: "Webflow",
    xai: "xAI",
  }),
);

const CANDIDATE_TOKENS = `
vercel
stripe
cloudflare
figma
datadog
roblox
postman
spacex
andurilindustries
canonical
nuro
anthropic
xai
mongodb
gitlab
airbnb
discord
dropbox
fastly
launchdarkly
elastic
grafanalabs
planetscale
cockroachlabs
airtable
mixpanel
amplitude
webflow
algolia
mozilla
scaleai
togetherai
clickhouse
jetbrains
duolingo
mercury
twitch
newrelic
gleanwork
tailscale
temporaltechnologies
honeycomb
waymo
databricks
block
coinbase
reddit
lyft
pinterest
asana
robinhood
intercom
instacart
okta
brex
affirm
twilio
chime
netlify
prisma
inflectionai
customerio
descope
abnormal-security
abnormalsecurity
ably
acceleron
acorns
activecampaign
adastracorporation
addepar
adobe
adroll
adyen
aetion
agora
airbase
aircall
airkit
airwallex
akamai
alchemy
alertmedia
alloy
alphasense
alto
amagi
anaplan
anchorage
anchorageholdings
apartmentlist
apollo
appacademy
appdynamics
appfolio
appian
applecart
appliedintuition
appsflyer
aptos
aquasecurity
arizeai
asana
ashby
assemblage
assemblyai
at-bay
atlassian
atomic
attentive
aurora
auth0
automattic
avant
aviatrix
axonius
benchling
betterment
betterup
bigcommerce
bitgo
bitly
bitpanda
blacklane
blend
blueapron
bluecore
bluesky
bolt
boom
box
branch
braze
brightwheel
buildkite
bumble
calendly
calibrate
canva
carbonblack
carbonhealth
careem
carvana
caseware
celerdata
chainalysis
checkr
chime
circle
circleci
clarifai
clear
clearco
clever
clickup
clio
cloudkitchens
clumio
coalition
codefresh
codeium
coder
codesignal
codat
cohere
cohesity
commercetools
compass
contentful
confluent
consensys
convoy
coreweave
coursera
creditease
credittop
cribl
criteo
cruise
current
cyberark
dataminr
dbtlabs
deel
deepmind
deepgram
deliveryhero
demandbase
denali
density
dhi
digitalocean
divvy
docusign
doordash
doximity
drata
drift
drivetime
duckduckgo
duo
easypost
ebay
edgio
egnyte
eightfold
embroker
emeritus
enable
envoy
epicgames
equinix
ethos
everlaw
expel
exponent
faire
falconx
farfetch
fetchrewards
filecoin
filevine
finix
fireblocks
fivetran
flexport
flockfreight
flowcode
flywire
forage
forter
freshworks
front
fullstory
gemini
getaround
gitbook
github
gitpod
glassdoor
glossier
gong
gopuff
grammarly
greenhouse
gusto
hackerone
hackerrank
hashicorp
heap
hellofresh
hingehealth
houzz
hubspot
huggingface
humaninterest
improbable
indigo
insitro
insomniac
intuit
ironclad
iterable
jane-street
janestreet
jellyfish
jenkins
jobber
jobyaviation
juniper
karat
khanacademy
kikoff
klarna
klaviyo
kong
kraken
lattice
lime
linear
linkedin
liveramp
lob
logicmonitor
loom
loopio
lucid
luminar
lyrahealth
mailchimp
mambu
mattermost
maven
maze
medium
meesho
melio
metabase
miro
modernhealth
monday
monzo
moveworks
mural
mx
namely
navan
neo4j
netskope
nextdoor
niantic
notion
novo
nubank
nuvei
nylas
onetrust
openai
opendoor
openphone
opentable
outreach
owner
pagerduty
paloaltonetworks
parabola
paradox
paravision
patreon
payfit
payhawk
payoneer
paystack
peloton
perchwell
personio
pilot
pinwheel
plaid
pleo
podium
policygenius
postscript
preply
primer
procore
productboard
proofpoint
proton
public
puppet
qualia
quantcast
quizlet
ramp
rapid7
raycast
recroom
redcanary
redhat
reifyhealth
remitly
remote
replit
researchgate
retool
revolut
rippling
ro
roku
rubrik
salesloft
samsara
scale
segment
sendbird
sendgrid
sentinelone
servicetitan
sharechat
shipbob
shopify
side
similarweb
singlestore
skydio
slack
slice
smartrecruiters
smartsheet
snap
snapdocs
snowflake
snyk
solana
sonder
sorare
sourcegraph
splunk
spotify
springhealth
square
stackadapt
stackblitz
stacklok
starkware
stash
stellar
stitchfix
strava
stream
sumologic
supabase
surveymonkey
synthego
tanium
tekion
testgorilla
thebrowsercompany
thetrade-desk
thetradedesk
thoughtspot
thousandeyes
thumbtack
tile
toast
tonal
top-hat
tophat
tradeshift
travelperk
tripactions
triplebyte
trueml
truelayer
tubularlabs
udemy
unit
unity
updater
upstart
useinsider
vanta
vast
veeva
verkada
veritone
vimeo
virtahealth
virtru
visa
vistaprint
vouch
voyage
vts
warbyparker
weave
wealthfront
weebly
wefox
wepay
wetransfer
whatnot
wheel
whoop
wikimedia
wise
wiz
workato
workiva
worldcoin
wpengine
xendit
yelp
zapier
zendesk
zenefits
zeta
zip
zipline
ziprecruiter
zoom
zoox
zuora
zynga
1password
2u
23andme
6sense
8x8
99designs
a24
abacus
academy
accolade
acquia
acronis
actblue
activision
acumen
addepar
adthena
aeva
affinity
agent
airgarage
airspace
akasa
akili
alarm
algolia
alignable
allbirds
alltrails
alteryx
amobee
ampere
amplitude
andela
angellist
ansys
anyscale
apixio
apna
appboy
appdirect
appier
applovin
arcadia
argo
arkose
arcticwolf
arista
armis
articulate
aspiration
assertiveyield
attentive-mobile
augury
avantstay
avidxchange
away
axelera
axiom
axon
babel
backbase
backblaze
balanced
bamboohr
beamery
beeper
behavox
benepass
bettercloud
bharatpe
bigid
bigpanda
bigtincan
bill
billcom
billtrust
birdeye
bitrise
bitso
blackbaud
blizzard
bluevine
bombas
boomsupersonic
boomi
boosted
branchmetrics
brightcove
bringg
broadcom
buffer
bugcrowd
buildzoom
bumper
bytedance
caffeine
calendso
camunda
carta
caspio
cedar
census
certik
chargebee
checkout
checkoutcom
chewy
chronosphere
cisco
citi
civisanalytics
classdojo
clerk
clockwise
cloudera
cloudflare-inc
cloudinary
clover
cncf
coda
codecademy
coinlist
collectivehealth
color
commure
comscore
contentstack
contrastsecurity
convertkit
copado
copper
coursehero
craft
crunchbase
cryptocom
curology
cybereason
daily
dapperlabs
dashlane
dataiku
dataquest
datarobot
datasite
datastax
degreed
deliverr
digicert
digitalasset
digitalocean98
disco
discourse
disney
docker
doma
domino
dowjones
dremio
dribbble
drchrono
driftcom
drivewealth
duffel
dynatrace
earnin
easyagile
ecobee
ecovadis
edpuzzle
elasticco
electric
element
enigma
enova
entrata
eppo
ericsson
esri
eventbrite
evernote
evidation
exabeam
exiger
expedia
fabric
factorial
fanduel
faraday
fathom
federato
figment
findhelp
fingerprint
firehydrant
fiserv
flatiron
flipp
float
flutterwave
flux
formlabs
forward
foursquare
fox
freestar
freightwaves
freshbooks
frontapp
fundbox
g2
gainwell
gem
genies
geotab
getir
ginkgo
gitguardian
glovo
go1
gocardless
gohealth
gojek
goldbelly
goodrx
gorillas
gousto
greenlight
groq
groupon
guardanthealth
gumgum
gympass
h1
handshake
haus
hazelhealth
headspace
healthverity
helion
hibob
hims
himsandhers
hirevue
hivemapper
homebase
homesite
honor
horizon3ai
hopper
howl
hq
humanapi
humu
icon
ifttt
illumio
impact
impactradius
imprint
indeed
industrious
influxdata
innovaccer
insider
insightsoftware
instabase
integralads
intercomlondon
invision
invitae
ionq
ipa
ipsy
ivanti
jfrog
jobs
joinhandshake
jumpcloud
juni
justworks
kandji
kayak
keap
kevala
keyfactor
k Health
khealth
kindbody
kitmanlabs
klook
knowbe4
komodohealth
kount
krisp
lacework
lasso
launchpotato
lemonade
lendingclub
liftoff
lightspeed
littlebits
liverampcom
looker
loop
lumosity
lyftcorporate
macpaw
make
marqeta
masterclass
matterport
maymobility
medallia
medely
mejuri
memsql
meraki
metromile
microsoft
mindtickle
minted
miq
modernatx
mollie
monarch
mongodbinc
movableink
msquared
mux
namogoo
nansen
natera
nava
navis
nerdwallet
netapp
neuralink
newfront
newstore
nexhealth
nextiva
nextracker
ninjaone
noom
nordstrom
nu
nuna
observe
octopus
offerup
oli
omadahealth
omio
onfido
one
onefootball
onerail
onesignal
opensea
opentext
optimove
oracle
orca
outbrain
outschool
ownbackup
pacaso
paddle
panther
parker
parsleyhealth
pathai
patientpop
paxos
paypal
paytm
peacock
perimeter81
permutive
phreesia
pinecone
pipedrive
pitneybowes
pixability
planet
playstation
plume
polychain
postmates
prezi
project44
propel
prospa
pspdfkit
qualtrics
quora
radancy
rakuten
redbubble
redditinc
redox
relay
reprise
rescale
resy
reverb
ridecell
ringcentral
rise8
rivian
rokt
root
rover
rubicon
runway
saildrone
salary
sanity
schibsted
scopely
scribd
seatgeek
securityscorecard
seekout
seesaw
sendoso
sentry
shaper
shippo
shogun
sidecar
signifyd
siliconlabs
simplybusiness
skillshare
skims
skycatch
slab
slicehealth
smartnews
smugmug
snapsheet
socure
sofi
solv
sonatype
sondermind
soundcloud
spacelift
sparkpost
splash
spotai
sprig
springboard
sprinklr
squarespace
stackhawk
starburst
startrek
statespace
stord
strider
stripeinternships
strongdm
stubhub
substack
sumo
superhuman
superpedestrian
superrare
superunion
survata
suse
swiggy
swiftly
synack
synctera
taboola
talkdesk
tango
tapad
taskrabbit
taxbit
teachable
tealium
techstars
tentree
terminal
tesla
textnow
thales
thg
thrive
tidal
tiktok
timescale
tines
tinybird
tock
together
tokopedia
toptal
trace3
transferwise
transfix
transmitsecurity
treasuredata
trello
trulioo
trustedhealth
turo
twig
uber
udacity
ultimate
unacademy
unbabel
understood
uniswap
unqork
unsplash
upbound
uplevel
urbancompass
usertesting
usual
vacasa
validity
varicent
veed
vendr
venmo
veriff
verse
vertex
viagogo
via
vinted
virginpulse
visier
vistar
vivun
voxy
vrbo
vsco
wander
warner
wasabi
wave
wayfair
weavr
webpt
webull
weee
wejo
wellframe
weride
whisper
willowtree
windfall
wix
wolt
workday
workhuman
workrise
worldremit
woven
wowza
wrike
xata
xpeng
yahoo
yext
yieldstreet
yipitdata
yotpo
yougov
yugabyte
zapierinc
zenbusiness
zencore
zendrive
zenjob
zenoti
zeotap
zillow
zipcar
zocdoc
zola
zoominfo
zscaler
`.split(/\s+/).filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeToken(token) {
  return token.trim().toLowerCase();
}

function kebabId(token) {
  return normalizeToken(token)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseToken(token) {
  return normalizeToken(token)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function yamlString(value) {
  return JSON.stringify(value);
}

async function readStdinTokens() {
  if (process.stdin.isTTY) {
    return [];
  }

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function readExistingCompanyTokens() {
  if (!existsSync("companies.yaml")) {
    return [];
  }

  try {
    const data = parse(readFileSync("companies.yaml", "utf8"));
    if (!Array.isArray(data?.companies)) {
      return [];
    }
    return data.companies
      .map((company) => company?.boardToken)
      .filter((token) => typeof token === "string" && token.trim() !== "");
  } catch (error) {
    console.error(`skipped existing companies.yaml tokens: ${error.message}`);
    return [];
  }
}

function uniqueCandidates(tokens) {
  const byToken = new Set();
  const byId = new Set();
  const candidates = [];

  for (const raw of tokens) {
    const token = normalizeToken(raw);
    if (!token) {
      continue;
    }
    if (byToken.has(token)) {
      continue;
    }
    const id = kebabId(token);
    if (!id) {
      continue;
    }
    if (byId.has(id)) {
      console.error(`skipped duplicate boardToken after id normalization: ${raw}`);
      continue;
    }
    byToken.add(token);
    byId.add(id);
    candidates.push(token);
  }

  return candidates;
}

async function probe(token, attempt = 0) {
  const url = `${API_ROOT}/${encodeURIComponent(token)}/jobs`;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "pinger-greenhouse-probe/1.0",
      },
    });
  } catch (error) {
    return { token, status: "ERR", total: "", error: error.message };
  }

  if (response.status === 429 && attempt < MAX_429_RETRIES) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const delaySeconds = Number.isFinite(retryAfter)
      ? Math.min(Math.max(retryAfter, 0), 30)
      : 2 ** (attempt + 1);
    await sleep(delaySeconds * 1000);
    return probe(token, attempt + 1);
  }

  if (response.status !== 200) {
    return { token, status: String(response.status), total: "" };
  }

  try {
    const json = await response.json();
    const total = Array.isArray(json.jobs) ? json.jobs.length : 0;
    return { token, status: "200", total };
  } catch (error) {
    return { token, status: "200", total: "", error: error.message };
  }
}

async function probeAll(tokens) {
  const results = new Array(tokens.length);
  let next = 0;

  async function worker() {
    while (next < tokens.length) {
      const index = next;
      next += 1;
      results[index] = await probe(tokens[index]);
      const { token, status, total } = results[index];
      console.log(`${token}\t${status}\t${total}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

function companyRow(token) {
  const id = kebabId(token);
  const name = NAME_MAP.get(token) ?? titleCaseToken(token);
  return [
    `  - id: ${yamlString(id)}`,
    `    name: ${yamlString(name)}`,
    "    ats: greenhouse",
    `    boardToken: ${yamlString(token)}`,
    "    enabled: false",
  ].join("\n");
}

async function writeGeneratedYaml(results) {
  const okTokens = results
    .filter((result) => result.status === "200")
    .map((result) => result.token)
    .sort((a, b) => a.localeCompare(b));

  const yaml = [
    "vault:",
    "  careerPath: Career/",
    "",
    "llm:",
    "  model: gemini-2.5-flash",
    "",
    "companies:",
    ...okTokens.map(companyRow),
    "",
  ].join("\n");

  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile("companies.generated.yaml", yaml, "utf8"),
  );
  console.error(`wrote companies.generated.yaml with ${okTokens.length} HTTP 200 boards`);
}

const stdinTokens = await readStdinTokens();
const existingCompanyTokens = readExistingCompanyTokens();
const candidates = uniqueCandidates([
  ...CANDIDATE_TOKENS,
  ...existingCompanyTokens,
  ...stdinTokens,
]);
console.error(`probing ${candidates.length} candidate Greenhouse boards`);
const results = await probeAll(candidates);
await writeGeneratedYaml(results);
