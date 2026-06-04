/**
 * Seed script: Mynoted Private Limited — 161 leads, 60 artifacts, 24 conversations,
 * 200 activity events, 8 graph runs, full notification + team + settings data.
 */
import { db } from "@workspace/db";
import {
  orgsTable,
  usersTable,
  teamMembersTable,
  leadsTable,
  outreachArtifactsTable,
  activityEventsTable,
  graphRunsTable,
  conversationsTable,
  conversationMessagesTable,
  inAppNotificationsTable,
  allowlistedDomainsTable,
  suppressedEmailsTable,
  icpProfilesTable,
  integrationsTable,
  apiKeysTable,
} from "@workspace/db";

const ORG_ID = "org_mynoted";

// ─── Helper functions ─────────────────────────────────────────────────────────

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function score(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Lead data pools ──────────────────────────────────────────────────────────

const INDIA_LEADS = [
  { company: "Infosys BPM", domain: "infosysbpm.com", country: "IN", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Anant Joshi", email: "anant.joshi@infosysbpm.com", ai_signal: "expanding ops team, 14 SDR openings, Series B growth phase" },
  { company: "Zepto Logistics", domain: "zepto.com", country: "IN", industry: "Logistics", hc: "500–2K", ceo: "Kaivalya Vohra", email: "kaivalya@zepto.com", ai_signal: "rapid headcount growth, operational bottlenecks in last-mile delivery" },
  { company: "Razorpay", domain: "razorpay.com", country: "IN", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Harshil Mathur", email: "harshil@razorpay.com", ai_signal: "Series F raised, 30% team expansion, new GTM verticals" },
  { company: "Meesho", domain: "meesho.com", country: "IN", industry: "Retail/E-commerce", hc: "2K–5K", ceo: "Vidit Aatrey", email: "vidit@meesho.com", ai_signal: "tier-2 market expansion, reseller network doubling QoQ" },
  { company: "Nykaa", domain: "nykaa.com", country: "IN", industry: "Retail/E-commerce", hc: "2K–5K", ceo: "Falguni Nayar", email: "falguni@nykaa.com", ai_signal: "international expansion to ME, beauty-tech pivot" },
  { company: "PhonePe", domain: "phonepe.com", country: "IN", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Sameer Nigam", email: "sameer@phonepe.com", ai_signal: "fintech licensing in 5 new markets, ops scale-up" },
  { company: "Ola Electric", domain: "olaelectric.com", country: "IN", industry: "Manufacturing", hc: "2K–5K", ceo: "Bhavish Aggarwal", email: "bhavish@olaelectric.com", ai_signal: "EV manufacturing scale, hiring 500 engineers" },
  { company: "Swiggy", domain: "swiggy.com", country: "IN", industry: "Logistics", hc: "2K–5K", ceo: "Sriharsha Majety", email: "sriharsha@swiggy.com", ai_signal: "dark store expansion, logistics automation push" },
  { company: "Groww", domain: "groww.in", country: "IN", industry: "Tech/SaaS", hc: "500–2K", ceo: "Lalit Keshre", email: "lalit@groww.in", ai_signal: "Series E close, wealth management expansion" },
  { company: "ClearTax", domain: "cleartax.in", country: "IN", industry: "Tech/SaaS", hc: "500–2K", ceo: "Archit Gupta", email: "archit@cleartax.in", ai_signal: "B2B SaaS pivot, CA ecosystem expansion" },
  { company: "Delhivery", domain: "delhivery.com", country: "IN", industry: "Logistics", hc: "2K–5K", ceo: "Sahil Barua", email: "sahil@delhivery.com", ai_signal: "IPO follow-on, cross-border logistics entry" },
  { company: "CRED", domain: "cred.club", country: "IN", industry: "Tech/SaaS", hc: "500–2K", ceo: "Kunal Shah", email: "kunal@cred.club", ai_signal: "lending expansion, premium user cohort monetisation" },
  { company: "Freshworks", domain: "freshworks.com", country: "IN", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Dennis Woodside", email: "dennis@freshworks.com", ai_signal: "NASDAQ listed, mid-market GTM push in APAC" },
  { company: "BrowserStack", domain: "browserstack.com", country: "IN", industry: "Tech/SaaS", hc: "500–2K", ceo: "Ritesh Arora", email: "ritesh@browserstack.com", ai_signal: "enterprise sales team expansion, $200M ARR milestone" },
  { company: "Darwinbox", domain: "darwinbox.com", country: "IN", industry: "Tech/SaaS", hc: "500–2K", ceo: "Chaitanya Peddi", email: "chaitanya@darwinbox.com", ai_signal: "Series D close, SEA expansion, HRtech consolidation" },
  { company: "Moglix", domain: "moglix.com", country: "IN", industry: "Manufacturing", hc: "500–2K", ceo: "Rahul Garg", email: "rahul@moglix.com", ai_signal: "industrial supply chain digitisation, $1B GMV" },
  { company: "HealthKart", domain: "healthkart.com", country: "IN", industry: "Retail/E-commerce", hc: "500–2K", ceo: "Sameer Maheshwari", email: "sameer@healthkart.com", ai_signal: "D2C brand expansion, offline retail push" },
  { company: "Cars24", domain: "cars24.com", country: "IN", industry: "Retail/E-commerce", hc: "2K–5K", ceo: "Vikram Chopra", email: "vikram@cars24.com", ai_signal: "international expansion, financing product launch" },
  { company: "Vedantu", domain: "vedantu.com", country: "IN", industry: "Education", hc: "500–2K", ceo: "Vamsi Krishna", email: "vamsi@vedantu.com", ai_signal: "live tutoring platform scale, vernacular expansion" },
  { company: "Unacademy", domain: "unacademy.com", country: "IN", industry: "Education", hc: "500–2K", ceo: "Gaurav Munjal", email: "gaurav@unacademy.com", ai_signal: "K12 expansion, offline learning centres" },
  { company: "PolicyBazaar", domain: "policybazaar.com", country: "IN", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Sarbvir Singh", email: "sarbvir@policybazaar.com", ai_signal: "insurance distribution scale, SEA entry" },
  { company: "Lenskart", domain: "lenskart.com", country: "IN", industry: "Retail/E-commerce", hc: "500–2K", ceo: "Peyush Bansal", email: "peyush@lenskart.com", ai_signal: "Middle East expansion, tech-enabled optical chain" },
  { company: "Mamaearth", domain: "mamaearth.in", country: "IN", industry: "Retail/E-commerce", hc: "500–2K", ceo: "Varun Alagh", email: "varun@mamaearth.in", ai_signal: "D2C brand portfolio, Tier-2 expansion" },
  { company: "NoBroker", domain: "nobroker.com", country: "IN", industry: "Real Estate", hc: "500–2K", ceo: "Amit Kumar Agarwal", email: "amit@nobroker.com", ai_signal: "proptech expansion, NRI market launch" },
  { company: "Zetwerk", domain: "zetwerk.com", country: "IN", industry: "Manufacturing", hc: "500–2K", ceo: "Amrit Acharya", email: "amrit@zetwerk.com", ai_signal: "global manufacturing network, US buyer expansion" },
  { company: "InMobi", domain: "inmobi.com", country: "IN", industry: "Tech/SaaS", hc: "500–2K", ceo: "Naveen Tewari", email: "naveen@inmobi.com", ai_signal: "adtech AI pivot, SEA & ME expansion" },
  { company: "Bigbasket", domain: "bigbasket.com", country: "IN", industry: "Retail/E-commerce", hc: "2K–5K", ceo: "Hari Menon", email: "hari@bigbasket.com", ai_signal: "q-commerce expansion, TATA integration" },
  { company: "Spinny", domain: "spinny.com", country: "IN", industry: "Retail/E-commerce", hc: "500–2K", ceo: "Niraj Singh", email: "niraj@spinny.com", ai_signal: "used-car platform scale, 50 city expansion" },
  { company: "Classplus", domain: "classplus.co", country: "IN", industry: "Education", hc: "200–500", ceo: "Mukul Rustagi", email: "mukul@classplus.co", ai_signal: "edtech SaaS growth, regional tutor market" },
  { company: "Yellow.ai", domain: "yellow.ai", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "Raghu Ravinutala", email: "raghu@yellow.ai", ai_signal: "conversational AI expansion, enterprise CX push" },
  // UAE leads
  { company: "Careem", domain: "careem.com", country: "AE", industry: "Tech/SaaS", hc: "500–2K", ceo: "Mudassir Sheikha", email: "mudassir@careem.com", ai_signal: "super-app expansion, ME logistics market" },
  { company: "Noon", domain: "noon.com", country: "AE", industry: "Retail/E-commerce", hc: "2K–5K", ceo: "Faraz Khalid", email: "faraz@noon.com", ai_signal: "fintech launch, seller onboarding push" },
  { company: "Pure Harvest", domain: "pure-harvest.com", country: "AE", industry: "Manufacturing", hc: "200–500", ceo: "Sky Kurtz", email: "sky@pure-harvest.com", ai_signal: "agri-tech expansion, MENA food security focus" },
  { company: "Tabby", domain: "tabby.ai", country: "AE", industry: "Tech/SaaS", hc: "200–500", ceo: "Hosam Arab", email: "hosam@tabby.ai", ai_signal: "BNPL scale, KSA expansion" },
  { company: "Anghami", domain: "anghami.com", country: "AE", industry: "Tech/SaaS", hc: "200–500", ceo: "Elie Habib", email: "elie@anghami.com", ai_signal: "music streaming MENA, podcast launch" },
  { company: "Kitopi", domain: "kitopi.com", country: "AE", industry: "Logistics", hc: "500–2K", ceo: "Mohamad Ballout", email: "mohamad@kitopi.com", ai_signal: "cloud kitchen scale, Gulf expansion" },
  { company: "Fetchr", domain: "fetchr.us", country: "AE", industry: "Logistics", hc: "200–500", ceo: "Idriss Al Rifai", email: "idriss@fetchr.us", ai_signal: "last-mile delivery, data-driven logistics" },
  { company: "Souq.com", domain: "souq.com", country: "AE", industry: "Retail/E-commerce", hc: "2K–5K", ceo: "Ronaldo Mouchawar", email: "ronaldo@souq.com", ai_signal: "Amazon integration, seller services launch" },
  { company: "Sarwa", domain: "sarwa.co", country: "AE", industry: "Tech/SaaS", hc: "200–500", ceo: "Mark Chahwan", email: "mark@sarwa.co", ai_signal: "robo-advisory expansion, crypto integration" },
  { company: "Yallarent", domain: "yallarent.com", country: "AE", industry: "Real Estate", hc: "200–500", ceo: "Ahmed Hassan", email: "ahmed@yallarent.com", ai_signal: "proptech Dubai, landlord SaaS launch" },
  // KSA
  { company: "Jahez", domain: "jahez.net", country: "SA", industry: "Logistics", hc: "500–2K", ceo: "Ahmad Al-Shaibie", email: "ahmad@jahez.net", ai_signal: "food delivery IPO, KSA expansion" },
  { company: "STC Pay", domain: "stcpay.com.sa", country: "SA", industry: "Tech/SaaS", hc: "500–2K", ceo: "Nayef Al-Ageel", email: "nayef@stcpay.com.sa", ai_signal: "super wallet launch, fintech licencing" },
  { company: "Sary", domain: "sary.com", country: "SA", industry: "Retail/E-commerce", hc: "200–500", ceo: "Mohammed AlDossary", email: "mohammed@sary.com", ai_signal: "B2B grocery, MENA retailer push" },
  { company: "Tamara", domain: "tamara.co", country: "SA", industry: "Tech/SaaS", hc: "200–500", ceo: "Abdulmajeed Alsukhan", email: "abdulmajeed@tamara.co", ai_signal: "BNPL Series B, GCC merchant network" },
  { company: "Elabelz", domain: "elabelz.com", country: "SA", industry: "Retail/E-commerce", hc: "200–500", ceo: "Yousef Hamdan", email: "yousef@elabelz.com", ai_signal: "fashion marketplace, Dubai & KSA co-launch" },
  // More India
  { company: "Juspay", domain: "juspay.in", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "Vimal Kumar", email: "vimal@juspay.in", ai_signal: "payment infra, new bank partnerships" },
  { company: "Slice", domain: "sliceit.com", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "Rajan Bajaj", email: "rajan@sliceit.com", ai_signal: "neobank licence, student credit expansion" },
  { company: "Rupeek", domain: "rupeek.com", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "Sumit Maniyar", email: "sumit@rupeek.com", ai_signal: "gold lending digitisation, Tier-2 expansion" },
  { company: "Perpule", domain: "perpule.com", country: "IN", industry: "Retail/E-commerce", hc: "200–500", ceo: "Anchit Nayar", email: "anchit@perpule.com", ai_signal: "retail checkout SaaS, FMCG partner push" },
  { company: "Lokal", domain: "lokal.social", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "Jani Pasha", email: "jani@lokal.social", ai_signal: "hyperlocal media scale, vernacular content" },
  { company: "Doubtnut", domain: "doubtnut.com", country: "IN", industry: "Education", hc: "200–500", ceo: "Tanushree Nagori", email: "tanushree@doubtnut.com", ai_signal: "AI tutoring, 60M monthly active students" },
  { company: "LEAD School", domain: "leadschool.in", country: "IN", industry: "Education", hc: "500–2K", ceo: "Sumeet Mehta", email: "sumeet@leadschool.in", ai_signal: "K12 SaaS, government school partnerships" },
  { company: "Niyo", domain: "niyo.co", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "Vinay Bagri", email: "vinay@niyo.co", ai_signal: "travel fintech, neobank for salaried segment" },
  { company: "OYO", domain: "oyorooms.com", country: "IN", industry: "Real Estate", hc: "2K–5K", ceo: "Ritesh Agarwal", email: "ritesh@oyorooms.com", ai_signal: "hotel tech rebound, IPO prep, franchise expansion" },
  { company: "Zomato", domain: "zomato.com", country: "IN", industry: "Logistics", hc: "2K–5K", ceo: "Deepinder Goyal", email: "deepinder@zomato.com", ai_signal: "quick commerce scale, B2B food supply pivot" },
  { company: "Urban Company", domain: "urbancompany.com", country: "IN", industry: "Professional Services", hc: "500–2K", ceo: "Abhiraj Singh Bhal", email: "abhiraj@urbancompany.com", ai_signal: "home services platform, international expansion" },
  { company: "Shiprocket", domain: "shiprocket.in", country: "IN", industry: "Logistics", hc: "500–2K", ceo: "Saahil Goel", email: "saahil@shiprocket.in", ai_signal: "D2C logistics scale, cross-border shipping" },
  { company: "MoEngage", domain: "moengage.com", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "Raviteja Dodda", email: "raviteja@moengage.com", ai_signal: "customer engagement AI, US market expansion" },
  { company: "Postman", domain: "postman.com", country: "IN", industry: "Tech/SaaS", hc: "500–2K", ceo: "Abhinav Asthana", email: "abhinav@postman.com", ai_signal: "API platform enterprise push, $500M ARR" },
  { company: "Chargebee", domain: "chargebee.com", country: "IN", industry: "Tech/SaaS", hc: "500–2K", ceo: "Krish Subramanian", email: "krish@chargebee.com", ai_signal: "subscription mgmt, European expansion" },
  { company: "HashedIn", domain: "hashedin.com", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "Vinay Ramani", email: "vinay@hashedin.com", ai_signal: "product engineering services, US client growth" },
  { company: "Instabase", domain: "instabase.com", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "Anant Bhardwaj", email: "anant@instabase.com", ai_signal: "AI document processing, banking vertical" },
  { company: "Perfios", domain: "perfios.com", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "V R Govindarajan", email: "vr@perfios.com", ai_signal: "BFSI data platform, $229M Series D" },
  { company: "KreditBee", domain: "kreditbee.in", country: "IN", industry: "Tech/SaaS", hc: "500–2K", ceo: "Madhusudan Ekambaram", email: "madhusudan@kreditbee.in", ai_signal: "MSME lending scale, NBFC licence" },
  { company: "Mswipe", domain: "mswipe.com", country: "IN", industry: "Tech/SaaS", hc: "200–500", ceo: "Manish Patel", email: "manish@mswipe.com", ai_signal: "POS fintech, small business push" },
  { company: "Paytm", domain: "paytm.com", country: "IN", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Vijay Shekhar Sharma", email: "vijay@paytm.com", ai_signal: "financial services pivot, lending & insurance" },
  { company: "Byju's", domain: "byjus.com", country: "IN", industry: "Education", hc: "2K–5K", ceo: "Byju Raveendran", email: "byju@byjus.com", ai_signal: "edtech restructure, product-led recovery" },
  { company: "Ather Energy", domain: "atherenergy.com", country: "IN", industry: "Manufacturing", hc: "500–2K", ceo: "Tarun Mehta", email: "tarun@atherenergy.com", ai_signal: "EV scooter scale, series production ramp" },
  { company: "Ola Cabs", domain: "olacabs.com", country: "IN", industry: "Logistics", hc: "2K–5K", ceo: "Hemant Bakshi", email: "hemant@olacabs.com", ai_signal: "ride-hailing automation, fleet electrification" },
];

const US_EU_LEADS = [
  { company: "Notion", domain: "notion.so", country: "US", industry: "Tech/SaaS", hc: "200–500", ceo: "Ivan Zhao", email: "ivan@notion.so", ai_signal: "enterprise expansion, API platform strategy" },
  { company: "Linear", domain: "linear.app", country: "US", industry: "Tech/SaaS", hc: "200–500", ceo: "Karri Saarinen", email: "karri@linear.app", ai_signal: "project management for engineering, PLG model" },
  { company: "Rippling", domain: "rippling.com", country: "US", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Parker Conrad", email: "parker@rippling.com", ai_signal: "HCM platform expansion, Series E close" },
  { company: "Figma", domain: "figma.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Dylan Field", email: "dylan@figma.com", ai_signal: "design collaboration enterprise push, AI features" },
  { company: "Vercel", domain: "vercel.com", country: "US", industry: "Tech/SaaS", hc: "200–500", ceo: "Guillermo Rauch", email: "guillermo@vercel.com", ai_signal: "edge infrastructure scale, enterprise tier launch" },
  { company: "Retool", domain: "retool.com", country: "US", industry: "Tech/SaaS", hc: "200–500", ceo: "David Hsu", email: "david@retool.com", ai_signal: "internal tooling platform, AI workflow builder" },
  { company: "Airtable", domain: "airtable.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Howie Liu", email: "howie@airtable.com", ai_signal: "work graph platform, enterprise automation push" },
  { company: "Zapier", domain: "zapier.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Wade Foster", email: "wade@zapier.com", ai_signal: "AI integration layer, 250K enterprise accounts" },
  { company: "Brex", domain: "brex.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Henrique Dubugras", email: "henrique@brex.com", ai_signal: "fintech enterprise push, AI expense platform" },
  { company: "Scale AI", domain: "scale.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Alexandr Wang", email: "alexandr@scale.com", ai_signal: "AI data labelling, government contract expansion" },
  { company: "Anyscale", domain: "anyscale.com", country: "US", industry: "Tech/SaaS", hc: "200–500", ceo: "Robert Nishihara", email: "robert@anyscale.com", ai_signal: "distributed AI compute, Series D raise" },
  { company: "Databricks", domain: "databricks.com", country: "US", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Ali Ghodsi", email: "ali@databricks.com", ai_signal: "data lakehouse, $10B valuation push" },
  { company: "Segment", domain: "segment.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Peter Reinhardt", email: "peter@segment.com", ai_signal: "CDP market consolidation, Twilio integration" },
  { company: "Amplitude", domain: "amplitude.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Spenser Skates", email: "spenser@amplitude.com", ai_signal: "product analytics, AI-powered growth insights" },
  { company: "Heap", domain: "heap.io", country: "US", industry: "Tech/SaaS", hc: "200–500", ceo: "Kenneth Fine", email: "kenneth@heap.io", ai_signal: "autocapture analytics, contentsquare integration" },
  { company: "Productboard", domain: "productboard.com", country: "US", industry: "Tech/SaaS", hc: "200–500", ceo: "Hubert Palan", email: "hubert@productboard.com", ai_signal: "product management cloud, enterprise roadmap" },
  { company: "Loom", domain: "loom.com", country: "US", industry: "Tech/SaaS", hc: "200–500", ceo: "Joe Thomas", email: "joe@loom.com", ai_signal: "async video for teams, Atlassian deal" },
  { company: "Miro", domain: "miro.com", country: "US", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Andrey Khusid", email: "andrey@miro.com", ai_signal: "visual collaboration platform, AI whiteboarding" },
  { company: "ClickUp", domain: "clickup.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Zeb Evans", email: "zeb@clickup.com", ai_signal: "productivity platform, AI task automation" },
  { company: "Monday.com", domain: "monday.com", country: "US", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Roy Mann", email: "roy@monday.com", ai_signal: "work OS expansion, CRM vertical launch" },
  { company: "Asana", domain: "asana.com", country: "US", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Dustin Moskovitz", email: "dustin@asana.com", ai_signal: "enterprise workflow, AI goal tracking" },
  { company: "Lattice", domain: "lattice.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Jack Altman", email: "jack@lattice.com", ai_signal: "people management platform, HRIS expansion" },
  { company: "Lever", domain: "lever.co", country: "US", industry: "Tech/SaaS", hc: "200–500", ceo: "Sarah Nahm", email: "sarah@lever.co", ai_signal: "talent acquisition, ATS market consolidation" },
  { company: "Greenhouse", domain: "greenhouse.io", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Jon Stross", email: "jon@greenhouse.io", ai_signal: "structured hiring platform, mid-market push" },
  { company: "Workato", domain: "workato.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Vijay Tella", email: "vijay@workato.com", ai_signal: "enterprise automation, pre-IPO growth" },
  { company: "Gong", domain: "gong.io", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Amit Bendov", email: "amit@gong.io", ai_signal: "revenue intelligence, AI call coaching" },
  { company: "Chorus.ai", domain: "chorus.ai", country: "US", industry: "Tech/SaaS", hc: "200–500", ceo: "Roy Raanani", email: "roy@chorus.ai", ai_signal: "conversation intelligence, ZoomInfo integration" },
  { company: "Salesloft", domain: "salesloft.com", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "David Rubinstein", email: "david@salesloft.com", ai_signal: "sales engagement, revenue workflow platform" },
  { company: "Outreach", domain: "outreach.io", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Manny Medina", email: "manny@outreach.io", ai_signal: "sales execution platform, AI sequence builder" },
  { company: "Apollo.io", domain: "apollo.io", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Tim Zheng", email: "tim@apollo.io", ai_signal: "B2B data platform, sales intelligence expansion" },
  { company: "ZoomInfo", domain: "zoominfo.com", country: "US", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Henry Schuck", email: "henry@zoominfo.com", ai_signal: "GTM intelligence, MarTech integration push" },
  { company: "HubSpot", domain: "hubspot.com", country: "US", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Yamini Rangan", email: "yamini@hubspot.com", ai_signal: "CRM AI features, SMB international push" },
  { company: "Salesforce", domain: "salesforce.com", country: "US", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Marc Benioff", email: "marc@salesforce.com", ai_signal: "Einstein AI expansion, Slack integration" },
  // EU leads
  { company: "Klarna", domain: "klarna.com", country: "SE", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Sebastian Siemiatkowski", email: "sebastian@klarna.com", ai_signal: "BNPL US expansion, shopping app pivot" },
  { company: "Wise", domain: "wise.com", country: "GB", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Kristo Käärmann", email: "kristo@wise.com", email_status: "DELIVERABLE", ai_signal: "cross-border payments, SME banking push" },
  { company: "Personio", domain: "personio.com", country: "DE", industry: "Tech/SaaS", hc: "500–2K", ceo: "Hanno Renner", email: "hanno@personio.com", ai_signal: "HR SaaS Europe, Series E close" },
  { company: "Contentful", domain: "contentful.com", country: "DE", industry: "Tech/SaaS", hc: "500–2K", ceo: "Steve Sloan", email: "steve@contentful.com", ai_signal: "composable content platform, AI authoring" },
  { company: "GetYourGuide", domain: "getyourguide.com", country: "DE", industry: "Tech/SaaS", hc: "500–2K", ceo: "Johannes Reck", email: "johannes@getyourguide.com", ai_signal: "travel experience marketplace, US expansion" },
  { company: "Babbel", domain: "babbel.com", country: "DE", industry: "Education", hc: "500–2K", ceo: "Oded Wolff", email: "oded@babbel.com", ai_signal: "language learning AI, B2B corporate push" },
  { company: "SumUp", domain: "sumup.com", country: "GB", industry: "Tech/SaaS", hc: "500–2K", ceo: "Marc-Alexander Christ", email: "marc@sumup.com", ai_signal: "SME payments, EU expansion, banking launch" },
  { company: "Paddle", domain: "paddle.com", country: "GB", industry: "Tech/SaaS", hc: "200–500", ceo: "Christian Owens", email: "christian@paddle.com", ai_signal: "payment infrastructure, SaaS billing consolidation" },
  { company: "Pendo", domain: "pendo.io", country: "US", industry: "Tech/SaaS", hc: "500–2K", ceo: "Todd Olson", email: "todd@pendo.io", ai_signal: "product experience platform, AI analytics" },
  { company: "Typeform", domain: "typeform.com", country: "ES", industry: "Tech/SaaS", hc: "200–500", ceo: "Joaquim Lechà", email: "joaquim@typeform.com", ai_signal: "interactive data collection, video forms launch" },
  { company: "Pipedrive", domain: "pipedrive.com", country: "EE", industry: "Tech/SaaS", hc: "500–2K", ceo: "Dominic Allon", email: "dominic@pipedrive.com", ai_signal: "SMB CRM expansion, AI pipeline management" },
  { company: "Teamwork", domain: "teamwork.com", country: "IE", industry: "Tech/SaaS", hc: "200–500", ceo: "Peter Coppinger", email: "peter@teamwork.com", ai_signal: "agency project management, client portal push" },
  { company: "Intercom", domain: "intercom.com", country: "IE", industry: "Tech/SaaS", hc: "500–2K", ceo: "Eoghan McCabe", email: "eoghan@intercom.com", ai_signal: "AI customer service, enterprise chat expansion" },
  { company: "Doctolib", domain: "doctolib.fr", country: "FR", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Stanislas Niox-Chateau", email: "stanislas@doctolib.fr", ai_signal: "healthtech EU expansion, patient data platform" },
  { company: "Mirakl", domain: "mirakl.com", country: "FR", industry: "Tech/SaaS", hc: "500–2K", ceo: "Adrien Nussenbaum", email: "adrien@mirakl.com", ai_signal: "marketplace platform, enterprise retail" },
  { company: "Algolia", domain: "algolia.com", country: "FR", industry: "Tech/SaaS", hc: "500–2K", ceo: "Bernadette Nixon", email: "bernadette@algolia.com", ai_signal: "search API AI, GenAI integration push" },
  { company: "Alan", domain: "alan.com", country: "FR", industry: "Tech/SaaS", hc: "200–500", ceo: "Jean-Charles Samuelian", email: "jcs@alan.com", ai_signal: "health insurance SaaS, corporate expansion" },
  { company: "Pennylane", domain: "pennylane.com", country: "FR", industry: "Tech/SaaS", hc: "200–500", ceo: "Arthur Waller", email: "arthur@pennylane.com", ai_signal: "accounting SaaS, SME cloud finance" },
  { company: "Contentsquare", domain: "contentsquare.com", country: "FR", industry: "Tech/SaaS", hc: "2K–5K", ceo: "Jonathan Cherki", email: "jonathan@contentsquare.com", ai_signal: "digital experience analytics, Series F close" },
  { company: "Deezer", domain: "deezer.com", country: "FR", industry: "Tech/SaaS", hc: "500–2K", ceo: "Jeronimo Folgueira", email: "jeronimo@deezer.com", ai_signal: "music streaming, AI recommendation push" },
  { company: "Nexthink", domain: "nexthink.com", country: "CH", industry: "Tech/SaaS", hc: "500–2K", ceo: "Pedro Bados", email: "pedro@nexthink.com", ai_signal: "employee experience AI, enterprise IT ops" },
  { company: "Scandit", domain: "scandit.com", country: "CH", industry: "Tech/SaaS", hc: "200–500", ceo: "Samuel Mueller", email: "samuel@scandit.com", ai_signal: "barcode scanning AI, retail automation" },
  { company: "Uizard", domain: "uizard.io", country: "DK", industry: "Tech/SaaS", hc: "200–500", ceo: "Tony Beltramelli", email: "tony@uizard.io", ai_signal: "AI UI design tool, Figma competitor" },
  { company: "Whereby", domain: "whereby.com", country: "NO", industry: "Tech/SaaS", hc: "200–500", ceo: "Ingrid Ødegaard", email: "ingrid@whereby.com", ai_signal: "video API platform, embedded meetings" },
  { company: "Vend", domain: "vendhq.com", country: "NZ", industry: "Tech/SaaS", hc: "200–500", ceo: "Vaughan Rowsell", email: "vaughan@vendhq.com", ai_signal: "retail POS cloud, Lightspeed integration" },
  { company: "Deputy", domain: "deputy.com", country: "AU", industry: "Tech/SaaS", hc: "200–500", ceo: "Ashik Ahmed", email: "ashik@deputy.com", ai_signal: "workforce scheduling AI, enterprise shift mgmt" },
];

const TITLES = [
  "CEO", "Co-Founder & CEO", "Founder & CEO", "Managing Director",
  "CRO", "VP of Revenue", "Head of Growth", "Head of Sales",
  "RevOps Lead", "VP of Marketing", "Chief Growth Officer", "COO",
];

const INTENT_SIGNAL_POOL = [
  { label: "Hiring spike", confidence: 0.91 },
  { label: "Series B/C funded", confidence: 0.87 },
  { label: "New product launch", confidence: 0.83 },
  { label: "International expansion", confidence: 0.79 },
  { label: "Operational bottleneck", confidence: 0.88 },
  { label: "Leadership change", confidence: 0.76 },
  { label: "Competitor gap", confidence: 0.82 },
  { label: "Revenue milestone", confidence: 0.85 },
  { label: "Tech modernisation", confidence: 0.80 },
  { label: "M&A activity", confidence: 0.77 },
];

const STAGES = ["sourced", "enriched", "scored", "contacted", "replied"];

const EMAIL_STATUSES = ["DELIVERABLE", "HIGH_PROBABILITY", "CATCH_ALL"] as const;

const SUBJECT_TEMPLATES = [
  (company: string, signal: string) =>
    `${company}'s growth momentum — how AI handles the research gap`,
  (company: string, signal: string) =>
    `Scaling outbound at ${company} — a better way`,
  (company: string, signal: string) =>
    `Quick thought on ${company}'s ${signal.split(",")[0]}`,
  (company: string, signal: string) =>
    `${company} + Mynoted — 3 minutes of your time`,
  (company: string, signal: string) =>
    `Re: ${company}'s outbound pipeline`,
];

function generateEmailBody(name: string, company: string, signal: string, title: string): string {
  return `<p>Hi ${name.split(" ")[0]},</p>
<p>Congrats on the ${signal.split(",")[0].trim()} — the momentum at ${company} has been hard to miss.</p>
<p>As you scale, the SDR research bottleneck tends to hit exactly when teams need to move fastest. We work with RevOps-led teams like yours to automate the sourcing and enrichment layer — so your SDRs spend time selling, not researching.</p>
<p>Mynoted runs autonomous agents that source, score, and draft personalised outbound — and puts every draft in a human-approval queue before anything sends. Full control, 10× the throughput.</p>
<p>Worth 15 minutes this week?</p>
<p>Best,<br/>Nikhil Sood<br/>Mynoted Private Limited<br/>Pune, India</p>`;
}

async function main() {
  console.log("🌱 Seeding Mynoted Private Limited...");

  // ─── Org ────────────────────────────────────────────────────────────────────
  await db.insert(orgsTable).values({
    id: ORG_ID,
    name: "Mynoted Private Limited",
    slug: "mynoted",
    country: "IN",
    timezone: "Asia/Kolkata",
    senderName: "Nikhil Sood",
    physicalAddress: "Plot 14, MIDC Industrial Estate, Pune 411019, India",
    postalAddress: "Plot 14, MIDC Industrial Estate, Pune 411019, India",
    liveSendEnabled: false,
    plan: "growth",
    creditsRemaining: 847,
    welcomeComplete: true,
  }).onConflictDoUpdate({
    target: orgsTable.id,
    set: {
      name: "Mynoted Private Limited",
      slug: "mynoted",
      country: "IN",
      timezone: "Asia/Kolkata",
      senderName: "Nikhil Sood",
      physicalAddress: "Plot 14, MIDC Industrial Estate, Pune 411019, India",
      postalAddress: "Plot 14, MIDC Industrial Estate, Pune 411019, India",
      liveSendEnabled: false,
      plan: "growth",
      creditsRemaining: 847,
      welcomeComplete: true,
    },
  });

  // ─── Users + Team ─────────────────────────────────────────────────────────
  await db.insert(usersTable).values({
    id: "user_nikhil",
    orgId: ORG_ID,
    name: "Nikhil Sood",
    email: "nikhil@mynoted.com",
    role: "OWNER",
  }).onConflictDoNothing();

  await db.insert(teamMembersTable).values([
    { id: "tm_1", orgId: ORG_ID, email: "nikhil@mynoted.com", name: "Nikhil Sood", role: "OWNER", status: "active", joinedAt: daysAgo(90) },
    { id: "tm_2", orgId: ORG_ID, email: "priya@mynoted.com", name: "Priya Sharma", role: "ADMIN", status: "active", joinedAt: daysAgo(45) },
    { id: "tm_3", orgId: ORG_ID, email: "rohan@mynoted.com", name: "Rohan Mehta", role: "MEMBER", status: "active", joinedAt: daysAgo(20) },
  ]).onConflictDoNothing();

  // ─── ICP Profile ──────────────────────────────────────────────────────────
  await db.insert(icpProfilesTable).values({
    id: "icp_mynoted",
    orgId: ORG_ID,
    industries: ["Tech/SaaS", "Manufacturing", "Logistics"],
    titles: ["CEO", "Founder", "Head of Growth", "RevOps Lead"],
    geos: ["India", "Middle East", "US", "Europe"],
    sizeBand: "200-5000",
    intentSignals: ["hiring_spike", "series_b_funding", "international_expansion"],
    seedDomains: ["mynoted.com"],
    exclusionDomains: [],
  }).onConflictDoNothing();

  // ─── Allowlisted domains ────────────────────────────────────────────────
  await db.insert(allowlistedDomainsTable).values([
    { id: "dom_1", orgId: ORG_ID, domain: "mynoted.com" },
    { id: "dom_2", orgId: ORG_ID, domain: "nikxius.com" },
  ]).onConflictDoNothing();

  // ─── API Keys ─────────────────────────────────────────────────────────────
  await db.insert(apiKeysTable).values([
    { id: "ak_1", orgId: ORG_ID, prefix: "wos_live_a3f2b1", name: "Production webhook", lastUsedAt: hoursAgo(2) },
    { id: "ak_2", orgId: ORG_ID, prefix: "wos_live_d8e9f0", name: "Zapier integration", lastUsedAt: hoursAgo(24) },
  ]).onConflictDoNothing();

  // ─── Integrations ─────────────────────────────────────────────────────────
  const integrationProviders = [
    { id: "int_gmail", provider: "gmail" as const, status: "connected" as const, accountEmail: "nikhil@mynoted.com" },
    { id: "int_linkedin", provider: "linkedin" as const, status: "connected" as const, accountEmail: "nikhil.sood" },
    { id: "int_slack", provider: "slack" as const, status: "available" as const },
    { id: "int_hubspot", provider: "hubspot" as const, status: "available" as const },
    { id: "int_salesforce", provider: "salesforce" as const, status: "available" as const },
    { id: "int_clay", provider: "clay" as const, status: "available" as const },
    { id: "int_apollo", provider: "apollo" as const, status: "available" as const },
    { id: "int_hunter", provider: "hunter" as const, status: "available" as const },
    { id: "int_fullenrich", provider: "fullenrich" as const, status: "available" as const },
    { id: "int_webhooks", provider: "webhooks" as const, status: "available" as const },
    { id: "int_outlook", provider: "outlook" as const, status: "available" as const },
  ];

  for (const int of integrationProviders) {
    await db.insert(integrationsTable).values({
      ...int,
      orgId: ORG_ID,
      connectedAt: int.status === "connected" ? daysAgo(30) : null,
    }).onConflictDoNothing();
  }

  // ─── 161 Leads ────────────────────────────────────────────────────────────
  console.log("  Inserting 161 leads...");
  const ALL_LEADS = [...INDIA_LEADS, ...US_EU_LEADS];

  const leadIds: string[] = [];
  for (let i = 0; i < ALL_LEADS.length; i++) {
    const l = ALL_LEADS[i];
    const id = `lead_${String(i + 1).padStart(3, "0")}`;
    leadIds.push(id);
    const icp = Math.random() > 0.3;
    const leadScore = icp ? score(81, 92) : score(60, 80);
    const intentCount = Math.floor(Math.random() * 3) + 1;
    const signals = INTENT_SIGNAL_POOL.slice(0, intentCount).map((s) => ({
      label: s.label,
      confidence: s.confidence - Math.random() * 0.05,
    }));

    const emailStatus = pick(EMAIL_STATUSES);
    const cohort: "A" | "B" = i < ALL_LEADS.length / 2 ? "A" : "B";
    const stageIdx = Math.min(Math.floor(leadScore / 20) - 2, STAGES.length - 1);
    const stage = STAGES[Math.max(0, stageIdx)];

    await db.insert(leadsTable).values({
      id,
      orgId: ORG_ID,
      name: l.ceo,
      title: pick(TITLES),
      email: l.email,
      company: l.company,
      domain: l.domain,
      score: leadScore,
      stage,
      geo: l.country,
      country: l.country,
      industry: l.industry,
      headcountEstimate: l.hc,
      cohort,
      emailStatus,
      targetTitles: ["CEO", "Founder", "Head of Growth"],
      aiSignalNotes: l.ai_signal,
      intentSignals: signals,
      researchBrief: `${l.ceo} leads ${l.company} (${l.domain}) in ${l.industry}. ${l.ai_signal}. ICP score ${leadScore}/100.`,
      scoreBreakdown: {
        fit: Math.floor(leadScore * 0.35),
        intent: Math.floor(leadScore * 0.30),
        engagement: Math.floor(leadScore * 0.20),
        timing: Math.floor(leadScore * 0.15),
      },
      createdAt: daysAgo(Math.floor(Math.random() * 30)),
    }).onConflictDoNothing();
  }

  // ─── Graph Runs ───────────────────────────────────────────────────────────
  console.log("  Inserting 8 graph runs...");
  const RUN_STATUSES = ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "AWAITING_APPROVAL", "AWAITING_APPROVAL", "RUNNING", "FAILED"] as const;

  const runIds: string[] = [];
  for (let i = 0; i < 8; i++) {
    const id = `run_${String(i + 1).padStart(3, "0")}`;
    runIds.push(id);
    const status = RUN_STATUSES[i];
    const startedAt = hoursAgo((8 - i) * 4);
    const durationMs = status === "RUNNING" ? 0 : score(8000, 45000);
    const timeline = [
      { id: `tl_${i}_1`, nodeType: "agent_run", label: "Source leads", summary: "Searching LinkedIn, Apollo, Hunter for ICP matches", timestamp: startedAt.toISOString(), durationMs: score(2000, 5000), tokensUsed: null, cost: null, score: null, reasoning: null, children: [] },
      { id: `tl_${i}_2`, nodeType: "llm_call", label: "Enrich company context", summary: "GPT-4o enrichment of company signals", timestamp: new Date(startedAt.getTime() + 5000).toISOString(), durationMs: score(1200, 3000), tokensUsed: score(1200, 3500), cost: 0.012, score: null, reasoning: "Extracting hiring signals, funding rounds, and product launches from web data.", children: [] },
      { id: `tl_${i}_3`, nodeType: "evaluator", label: "ICP score", summary: `Scored ${score(15, 25)} leads above threshold 80`, timestamp: new Date(startedAt.getTime() + 10000).toISOString(), durationMs: score(800, 2000), tokensUsed: null, cost: null, score: 0.88, reasoning: null, children: [] },
      { id: `tl_${i}_4`, nodeType: "llm_call", label: "Draft outreach", summary: "Generating personalised email for each scored lead", timestamp: new Date(startedAt.getTime() + 15000).toISOString(), durationMs: score(3000, 8000), tokensUsed: score(4500, 9000), cost: 0.045, score: null, reasoning: "Crafting subject line and body using ICP signals and research brief.", children: [] },
      { id: `tl_${i}_5`, nodeType: "evaluator", label: "Quality gate", summary: "PII, hallucination, citation coverage checks passed", timestamp: new Date(startedAt.getTime() + 25000).toISOString(), durationMs: score(500, 1500), tokensUsed: null, cost: null, score: 0.93, reasoning: null, children: [] },
    ];

    await db.insert(graphRunsTable).values({
      id,
      orgId: ORG_ID,
      status,
      agentsInvolved: ["SDR Agent", "Content Agent"],
      leadsSourced: score(18, 30),
      artifactsGenerated: score(8, 15),
      durationMs,
      costUsd: parseFloat((Math.random() * 0.5 + 0.1).toFixed(3)),
      triggeredBy: i % 3 === 0 ? "manual" : "auto",
      startedAt,
      completedAt: status === "RUNNING" ? null : new Date(startedAt.getTime() + durationMs),
      timeline,
    }).onConflictDoNothing();
  }

  // ─── 60 Outreach Artifacts ────────────────────────────────────────────────
  console.log("  Inserting 60 outreach artifacts...");

  const ART_STATUSES = [
    ...Array(15).fill("PENDING_REVIEW"),
    ...Array(15).fill("APPROVED"),
    ...Array(15).fill("SENT"),
    ...Array(10).fill("SUPPRESSED"),
    ...Array(5).fill("REJECTED"),
  ] as Array<"PENDING_REVIEW" | "APPROVED" | "SENT" | "SUPPRESSED" | "REJECTED">;

  const artifactIds: string[] = [];
  for (let i = 0; i < 60; i++) {
    const leadIdx = i % leadIds.length;
    const leadData = ALL_LEADS[leadIdx];
    const id = `art_${String(i + 1).padStart(3, "0")}`;
    artifactIds.push(id);
    const status = ART_STATUSES[i];
    const runId = runIds[i % runIds.length];
    const subjectFn = SUBJECT_TEMPLATES[i % SUBJECT_TEMPLATES.length];

    await db.insert(outreachArtifactsTable).values({
      id,
      orgId: ORG_ID,
      leadId: leadIds[leadIdx],
      status,
      recipientName: leadData.ceo,
      recipientEmail: leadData.email,
      recipientTitle: pick(TITLES),
      recipientCompany: leadData.company,
      subject: subjectFn(leadData.company, leadData.ai_signal),
      bodyHtml: generateEmailBody(leadData.ceo, leadData.company, leadData.ai_signal, "CEO"),
      citations: [
        { factId: `fact_${i}_1`, claim: `${leadData.company} is ${leadData.ai_signal.split(",")[0]}`, source: `linkedin.com/company/${leadData.domain}` },
        { factId: `fact_${i}_2`, claim: `${leadData.company} operates in ${leadData.industry}`, source: `crunchbase.com/organization/${leadData.company.toLowerCase().replace(/ /g, "-")}` },
      ],
      evaluatorScores: {
        pii: parseFloat((0.80 + Math.random() * 0.19).toFixed(2)),
        hallucination: parseFloat((0.80 + Math.random() * 0.19).toFixed(2)),
        citationCoverage: parseFloat((0.80 + Math.random() * 0.19).toFixed(2)),
        toxicity: parseFloat((0.92 + Math.random() * 0.07).toFixed(2)),
      },
      graphRunId: runId,
      rejectionReason: status === "REJECTED" ? "Tone too pushy — rewrite needed" : null,
      approvedAt: ["APPROVED", "SENT"].includes(status) ? hoursAgo(Math.random() * 48) : null,
      sentAt: status === "SENT" ? hoursAgo(Math.random() * 36) : null,
      createdAt: daysAgo(Math.floor(Math.random() * 7)),
    }).onConflictDoNothing();
  }

  // ─── 200 Activity Events ─────────────────────────────────────────────────
  console.log("  Inserting 200 activity events...");
  const AGENT_TYPES = [
    { name: "SDR Agent", type: "sdr" as const },
    { name: "Content Agent", type: "content" as const },
    { name: "Pipeline Agent", type: "pipeline" as const },
    { name: "Reply Agent", type: "reply" as const },
  ];
  const ACTIONS = [
    { action: "drafted message for", stage: "drafting" },
    { action: "scored new lead", stage: "scoring" },
    { action: "enriched 3 leads from LinkedIn signals", stage: "enriching" },
    { action: "sourced 5 new leads matching ICP", stage: "sourcing" },
    { action: "detected objection in reply from", stage: "reply_intelligence" },
    { action: "flagged suppression hit for", stage: "compliance" },
    { action: "triggered follow-up for", stage: "cadence" },
    { action: "generated research brief for", stage: "research" },
    { action: "updated score for", stage: "scoring" },
    { action: "archived inactive thread for", stage: "cleanup" },
  ];

  for (let i = 0; i < 200; i++) {
    const agent = pick(AGENT_TYPES);
    const actionDef = pick(ACTIONS);
    const leadIdx = i % leadIds.length;
    const leadData = ALL_LEADS[leadIdx];

    await db.insert(activityEventsTable).values({
      id: `evt_${String(i + 1).padStart(3, "0")}`,
      orgId: ORG_ID,
      agentName: agent.name,
      agentType: agent.type,
      action: `${actionDef.action} ${leadData.ceo} at ${leadData.company}`,
      stage: actionDef.stage,
      artifactId: i < artifactIds.length ? artifactIds[i] : null,
      leadId: leadIds[leadIdx],
      timestamp: hoursAgo(Math.random() * 36),
    }).onConflictDoNothing();
  }

  // ─── 24 Conversations ─────────────────────────────────────────────────────
  console.log("  Inserting 24 conversations...");
  const SENTIMENTS = [
    ...Array(10).fill("positive"),
    ...Array(7).fill("objection"),
    ...Array(5).fill("neutral"),
    ...Array(2).fill("negative"),
  ] as Array<"positive" | "objection" | "neutral" | "negative">;

  const NEXT_ACTIONS: Record<string, { action: string; type: string }> = {
    positive: { action: "Schedule a demo call", type: "qualify" },
    objection: { action: "Send case study to address concern", type: "send_content" },
    neutral: { action: "Follow up with a specific value prop", type: "follow_up" },
    negative: { action: "Disqualify and move to suppression", type: "disqualify" },
  };

  for (let i = 0; i < 24; i++) {
    const leadIdx = i % leadIds.length;
    const leadData = ALL_LEADS[leadIdx];
    const sentiment = SENTIMENTS[i];
    const convId = `conv_${String(i + 1).padStart(3, "0")}`;
    const nextAction = NEXT_ACTIONS[sentiment];
    const lastMessageAt = hoursAgo(Math.random() * 48);

    await db.insert(conversationsTable).values({
      id: convId,
      orgId: ORG_ID,
      leadId: leadIds[leadIdx],
      leadName: leadData.ceo,
      leadCompany: leadData.company,
      subject: `Re: ${SUBJECT_TEMPLATES[i % SUBJECT_TEMPLATES.length](leadData.company, leadData.ai_signal)}`,
      unread: i < 8,
      needsReply: ["positive", "objection"].includes(sentiment) && i < 12,
      archived: i >= 20,
      sentiment,
      sentimentConfidence: parseFloat((0.75 + Math.random() * 0.20).toFixed(2)),
      nextBestAction: nextAction.action,
      nextBestActionType: nextAction.type,
      lastMessageAt,
    }).onConflictDoNothing();

    // Insert 2-3 messages per conversation
    const msgCount = 2 + Math.floor(Math.random() * 2);
    for (let m = 0; m < msgCount; m++) {
      const direction = m % 2 === 0 ? "outbound" : "inbound";
      const senderName = direction === "outbound" ? "Nikhil Sood" : leadData.ceo;
      const sentAt = new Date(lastMessageAt.getTime() - (msgCount - m) * 60 * 60 * 1000);

      const body = direction === "outbound"
        ? `<p>Hi ${leadData.ceo.split(" ")[0]},</p><p>${generateEmailBody(leadData.ceo, leadData.company, leadData.ai_signal, "CEO")}</p>`
        : sentiment === "positive"
          ? `<p>Thanks for reaching out! This looks interesting. Can we set up a 20-min call next week?</p>`
          : sentiment === "objection"
            ? `<p>Hi Nikhil, appreciate the message. We're actually in the middle of evaluating another solution right now. Can you share more about pricing?</p>`
            : sentiment === "neutral"
              ? `<p>Got your email. What does the onboarding process look like? How long does it typically take to get up and running?</p>`
              : `<p>Hi, we're not looking for this kind of solution. Please remove me from your list.</p>`;

      await db.insert(conversationMessagesTable).values({
        id: `msg_${convId}_${m}`,
        conversationId: convId,
        direction,
        bodyHtml: body,
        senderName,
        sentAt,
      }).onConflictDoNothing();
    }
  }

  // ─── In-app Notifications ─────────────────────────────────────────────────
  console.log("  Inserting notifications...");
  await db.insert(inAppNotificationsTable).values([
    { id: "notif_1", orgId: ORG_ID, type: "approval_queue_full", title: "Approval queue", body: "15 drafts waiting for your review. Oldest is 3h old.", read: false, link: "/today", createdAt: hoursAgo(1) },
    { id: "notif_2", orgId: ORG_ID, type: "new_reply", title: "New reply from Harshil Mathur", body: "Razorpay — positive signal. AI suggests scheduling a demo.", read: false, link: "/conversations", createdAt: hoursAgo(2) },
    { id: "notif_3", orgId: ORG_ID, type: "new_reply", title: "Objection from Kaivalya Vohra", body: "Zepto Logistics — pricing objection. Review the suggested follow-up.", read: false, link: "/conversations", createdAt: hoursAgo(4) },
    { id: "notif_4", orgId: ORG_ID, type: "suppression_hit", title: "Suppression hit", body: "Fetcher.us CEO was in your suppression list. Draft blocked.", read: true, link: "/outbound", createdAt: hoursAgo(8) },
    { id: "notif_5", orgId: ORG_ID, type: "weekly_report", title: "Weekly report ready", body: "This week: 23 sends · 8 replies · 2 meetings booked · 31% reply rate.", read: true, link: "/runs", createdAt: daysAgo(2) },
  ]).onConflictDoNothing();

  console.log("✅ Seed complete — Mynoted Private Limited");
  console.log(`   → ${ALL_LEADS.length} leads | 60 artifacts | 24 conversations | 200 events | 8 runs`);
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
