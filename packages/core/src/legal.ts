import { APP_NAME } from "./copy";

/**
 * The Privacy Policy and the Terms of Service, at jonz.app/privacy and
 * jonz.app/terms. Google's OAuth consent screen, Microsoft's app
 * registration, Apple, Stripe Checkout and both stores link to these two
 * addresses, so the paths never change. Each page is sections of plain
 * paragraphs; a paragraph starting "• " is a list item. A section's links
 * show under its words.
 *
 * Who runs Jonz, how to reach them and whose law applies are in LEGAL, in
 * one place, because every store and sign-in provider checks they match.
 */
export const LEGAL = {
  /** Who runs Jonz: the "we" of both pages. */
  operator: "Glyn Finck",
  /** Where questions, deletion requests and complaints go. */
  email: "support@jonz.app",
  /** Whose courts and law the Terms name. */
  law: "England and Wales",
  /** When either page last changed in substance. */
  updated: "31 October 2026",
  privacyPath: "/privacy",
  helpPath: "/help",
  termsPath: "/terms",
  site: "https://jonz.app",
} as const;

export interface LegalLink {
  label: string;
  href: string;
}

export interface LegalSection {
  heading: string;
  body: readonly string[];
  links?: readonly LegalLink[];
}

export interface LegalPage {
  title: string;
  updated: string;
  lead: string;
  sections: readonly LegalSection[];
}

const CONTACT = `email ${LEGAL.email}`;

/**
 * Google asks for this sentence, word for word, from any app that signs in
 * with Google: the Limited Use disclosure.
 */
export const GOOGLE_LIMITED_USE = `${APP_NAME}’s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.`;

export const PRIVACY_POLICY: LegalPage = {
  title: "Privacy Policy",
  updated: `Last updated ${LEGAL.updated}`,
  lead: `${APP_NAME} keeps what it needs to share out your house’s Johns and nothing more. This page says what that is, who sees it, who helps us run ${APP_NAME}, and how to get it deleted. It covers the website at jonz.app and the ${APP_NAME} apps for iPhone and Android.`,
  sections: [
    {
      heading: "Who we are",
      body: [
        `${APP_NAME} is run by ${LEGAL.operator} (“we”, “us”), who decides how your information is used and is responsible for it. To ask about anything on this page, ${CONTACT}.`,
      ],
    },
    {
      heading: "What we keep",
      body: [
        "Your account: your name, your email address, a profile photo if your account has one, an ID from the account you sign in with, and which Terms you agreed to and when. We never see your password.",
        "Your house: its name, currency, time zone and rules; the Johns, who was given which, and when each was ticked; any photo you add to a tick; disputes, votes and reactions; time away and groups; the points table; the Stake ledger of what housemates owe each other; and the history of changes admins make.",
        "Reminders: if you turn them on, the address your browser or phone gives us to send notifications to, and which reminders you want and when.",
        "The House Pass: which plan your house has, who bought it, and the IDs Stripe gives the purchase. We never see or store card details.",
        "Ask Jonz: how many times your house used it each day and how long the answers were, so we can keep it within its daily limit. Not what you wrote.",
        "Reports: a problem, idea or question you send us in the app, any screenshots you add, our replies, and the details you choose to send with it (described below).",
        "Technical: our hosts keep short-lived logs of requests (your IP address, browser and the page asked for) to keep the service running and secure. Your browser or phone stores your sign-in and your light or dark choice. There are no ads, no analytics, and no tracking cookies.",
      ],
    },
    {
      heading: "Signing in with Google, Microsoft or Apple",
      body: [
        "We only ask each provider for what it takes to know who you are. We can’t read your email, files, contacts or calendar.",
        "• Google: your name, email address and profile photo (the openid, email and profile permissions). We show the photo from Google’s own address.",
        "• Microsoft: your name and email address, and your profile photo through Microsoft Graph (the User.Read permission). We read the photo once at sign-in and keep a copy so your housemates see it.",
        "• Apple: the name and email address you choose to share. If you use Hide My Email, we only see Apple’s relay address.",
        GOOGLE_LIMITED_USE,
        "We use information from Google, Microsoft and Apple only to sign you in and to show your name and photo to your house. We don’t sell it, use it for ads, or use it to train AI, and people only see it as this page describes.",
      ],
      links: [{ label: "Google API Services User Data Policy", href: "https://developers.google.com/terms/api-services-user-data-policy" }],
    },
    {
      heading: "How we use it",
      body: [
        "To run your house: deal the Johns, check ticks, keep the points and the Stake, and show your housemates what’s going on. To send the reminders you turned on. To sell and keep the House Pass. To keep the service secure, stop abuse, and fix what breaks.",
        "Where UK or EU data protection law applies, we rely on: providing the service you signed up for (contract); keeping it secure and working (our legitimate interests); your consent for notifications, which you can take back at any time; and the law, for records about payments.",
        "We don’t sell your information, show you ads, or use what you put in Jonz to train AI.",
      ],
    },
    {
      heading: "Who sees what",
      body: [
        "Only people in your house see your house: your name and photo, the Johns, ticks, photos, disputes, points, time away and the Stake. Your email address isn’t shown to them. If you buy the House Pass, the house sees that you bought it.",
        "Tick photos are stored privately and shown through links that expire after an hour. Profile photos are shown from web addresses that aren’t listed anywhere, so the app can load them quickly.",
        "Jonz never moves money. The ledger records what housemates owe each other; you settle up however you like, outside the app.",
      ],
    },
    {
      heading: "Ask Jonz",
      body: [
        "When an admin asks Jonz to draft or change the John list, what they write, the first names of the house and the house’s Johns are sent to Anthropic’s Claude, through Vercel’s AI Gateway, to write the answer. We don’t store the chat, and Anthropic doesn’t train on it. Please don’t put anything private in it that the house wouldn’t want shared.",
      ],
    },
    {
      heading: "Reports, ideas and questions",
      body: [
        "When you report a problem, send an idea or ask a question in Jonz, we keep what you wrote and any screenshots you add. If you leave “Send the details that help” ticked, it also carries the pages you were just on, your app or browser, your house’s name and the last error the app showed, all listed for you to read before you send. Nothing else about your house or your housemates goes with it.",
        "Only you and the person who runs Jonz can read a report. Screenshots are stored privately and shown through links that expire after an hour. A screenshot can show your housemates’ names, so crop it if you’d rather it didn’t. We reply in the app, with a notification, and by email.",
        `If you email ${LEGAL.email}, we keep your email address, the name your email gives, the subject and what you wrote (not the quoted history under it, and not attachments), and our replies, and answer by email. If the address is the one you sign in to ${APP_NAME} with, the email also shows under Your reports in the app. When we fix something you reported, we tell you, once, in the app and by email.`,
      ],
    },
    {
      heading: "Who helps us run Jonz",
      body: [
        "These companies process information for us, only to provide their part of the service:",
        "• Supabase: our database, sign-in and photo storage, in London, UK.",
        "• Vercel: hosts the website and the API, mainly in the United States.",
        "• Anthropic, through Vercel: writes Ask Jonz’s answers.",
        "• Resend: sends Jonz’s emails and receives replies to them, in Ireland, EU. It sees your email address and the email, and keeps them for 30 days.",
        "• Stripe, and Link (Stripe’s checkout): take payment for the House Pass and handle tax, receipts and refunds as the seller of record. They collect your payment details and billing address under Stripe’s own privacy policy.",
        "• Google, Microsoft and Apple: sign you in, and deliver notifications to your browser or phone (as do Mozilla for Firefox and other browser makers). Notifications say what the reminder is about and nothing else.",
        "We may also share information if the law requires it, to protect people’s safety, or with whoever takes over Jonz, who would be bound by this policy.",
      ],
      links: [
        { label: "Stripe privacy policy", href: "https://stripe.com/privacy" },
        { label: "Link privacy policy", href: "https://link.com/privacy" },
      ],
    },
    {
      heading: "Across borders",
      body: [
        "Your information is stored in the UK and may be handled in the United States and other countries by the companies above. Where UK or EU law needs it, those transfers are covered by the UK’s adequacy rules or the standard contractual clauses.",
      ],
    },
    {
      heading: "How long we keep it",
      body: [
        "Your account and house stay while you use Jonz. Leaving a house removes you from it; your past Johns stay in its history for the people still there. A house with nobody left in it is closed and can’t be joined again.",
        "Turning reminders off deletes that notification address. Hosting logs are kept for a few days, and never more than 90. Stripe keeps payment records as long as tax law requires.",
      ],
    },
    {
      heading: "Deleting your account",
      body: [
        `Delete your account in the app (House, then Delete my account) or at jonz.app/delete. It goes 30 days later; until then, signing in again and pressing Keep my account stops it, and your house sees you as away. Then your account, name, email, photo, notification addresses and sign-ins are deleted. A house you were in keeps its shared records, such as past Johns and the Stake ledger, shown as “Someone who left”. Reports you sent lose your name, email address and screenshots; what you wrote stays, so we can keep track of what needs fixing.`,
        "If you pay for a House Pass, it stops renewing when you ask, and covers the house to the end of what was paid. It renews again if you keep your account.",
        `If you can’t sign in any more, ${CONTACT} from the address on the account and we’ll start it for you.`,
        "You can also stop Jonz signing you in with your Google, Microsoft or Apple account from that account’s settings.",
      ],
      links: [
        { label: "Delete your account", href: `${LEGAL.site}/delete` },
        { label: "Google: apps with access", href: "https://myaccount.google.com/connections" },
        { label: "Microsoft: your apps", href: "https://myapps.microsoft.com" },
        { label: "Apple: Sign in with Apple", href: "https://account.apple.com/account/manage" },
      ],
    },
    {
      heading: "Your rights",
      body: [
        `You can ask for a copy of your information, have it corrected or deleted, object to how we use it, or ask us to limit it. ${CONTACT[0].toUpperCase()}${CONTACT.slice(1)} and we’ll answer within a month. Wherever you live, we’ll handle the request the same way.`,
        "If you’re in the UK you can complain to the Information Commissioner’s Office, and in the EU to your local data protection authority, though we’d like the chance to put it right first.",
      ],
      links: [{ label: "Information Commissioner’s Office", href: "https://ico.org.uk/make-a-complaint/" }],
    },
    {
      heading: "Children",
      body: [
        `${APP_NAME} is for people 13 or older. If you’re under the age where you live that you can agree to this yourself, ask a parent first. If you think a child under 13 has an account, ${CONTACT} and we’ll delete it.`,
      ],
    },
    {
      heading: "Keeping it safe",
      body: [
        "Everything travels encrypted. Each house’s information is walled off in the database so only its members can read it, and payment details never touch our servers. No service is perfectly secure, so if something does go wrong, we’ll tell the people affected.",
      ],
    },
    {
      heading: "Changes",
      body: [
        "If this page changes in a way that matters, we’ll say so in the app before it takes effect. The date at the top shows the latest version.",
      ],
    },
  ],
};

export const TERMS: LegalPage = {
  title: "Terms of Service",
  updated: `Last updated ${LEGAL.updated}`,
  lead: `These terms are the agreement between you and ${LEGAL.operator}, who runs ${APP_NAME}. By signing in or using ${APP_NAME} on the web, iPhone or Android, you agree to them, and to the Privacy Policy.`,
  sections: [
    {
      heading: "What Jonz is",
      body: [
        `${APP_NAME} shares out a house’s chores (Johns) fairly each week, lets housemates check each other’s ticks, and keeps the points and the Stake. Running a fair house is free. The House Pass adds the extras for the whole house.`,
      ],
    },
    {
      heading: "Your account",
      body: [
        "You need to be 13 or older, and old enough where you live to agree to these terms, or have a parent’s permission. Sign in as yourself, keep your account to yourself, and tell us if you think someone else is using it.",
      ],
    },
    {
      heading: "Your house",
      body: [
        "A house’s admins set its Johns, rules and Stake. Joining a house means you agree to play by the rules your housemates set, and they can see what you do there.",
        "The Stake and the points are a game between housemates. Jonz never holds or moves money: the ledger only records what housemates agreed to owe each other, and settling up is between you. We aren’t part of any agreement or disagreement between housemates, and can’t settle one.",
      ],
    },
    {
      heading: "What you put in",
      body: [
        "Names, Johns, photos and everything else you add stay yours. You let us store them and show them to your house, only so Jonz can work.",
        "Only add photos you have the right to share, and keep people out of them who didn’t agree to be in them. Don’t use Jonz to harass anyone, to break the law, to upload anything harmful, or to try to get into a house or account that isn’t yours, or to disrupt the service.",
        "We may remove content or close an account that breaks these terms.",
      ],
    },
    {
      heading: "Ask Jonz",
      body: [
        "Ask Jonz uses AI (Anthropic’s Claude) to draft and change your John list. It can get things wrong, so check its drafts: nothing changes in your house until an admin keeps them. Don’t put anything private in the chat.",
      ],
    },
    {
      heading: "The House Pass",
      body: [
        "One person buys the House Pass for their whole house. It comes yearly or monthly, or, for houses that start at launch, as a one-off Founding Pass that lasts for life. The price, in your currency and with any tax, is shown before you pay; in the US it’s $49.99 a year, $5.99 a month, or $69 once.",
        "A new house gets its first 30 days free. If you buy during them, the first charge waits until the free month ends.",
        "The Pass belongs to the person who pays for it, and covers the house they live in. If they leave and start or join another house, it goes with them, and the house they left keeps the extras for 30 more days. A Pass can move once every 30 days. If they’d rather leave it with the house, it runs to the end of the period already paid for and then stops renewing.",
        "Yearly and monthly plans renew automatically at the same price until you cancel. Cancel any time from Manage plan on the House Pass page, or at link.com; the house keeps the Pass until the end of the period already paid for. If we ever change the price, we’ll tell you before your next renewal, and you can cancel before it applies.",
        "On the web, the Pass is sold through Link, Stripe’s checkout, which acts as the seller of record: it takes the payment, charges any sales tax or VAT, and sends the receipts. Your card statement shows the charge starting “LINK.COM*”. Link’s terms cover the payment itself.",
        "Bought in the iPhone or Android app, the Pass is sold by Apple or Google under their terms, and cancelled and refunded through them.",
      ],
      links: [{ label: "Link: sold through Link", href: "https://support.link.com/topics/sold-through-link" }],
    },
    {
      heading: "Refunds",
      body: [
        `If the House Pass didn’t work out, ${CONTACT} within 14 days of being charged and we’ll refund you. After that, payments aren’t refunded for a part-used period, except where the law says otherwise. You can also ask Link support about a web payment; they may refund within 60 days.`,
        "If you’re a consumer in the UK or EU you can cancel a purchase within 14 days. Because the Pass starts as soon as you buy it, a refund then may be reduced for the days already used.",
      ],
    },
    {
      heading: "Changes and ending",
      body: [
        "We keep improving Jonz, so features change. If we stop offering a feature the House Pass pays for, or close Jonz, we’ll give at least 30 days’ notice and refund the unused part of any yearly or monthly plan.",
        "You can stop using Jonz and ask for your account to be deleted at any time (see the Privacy Policy).",
      ],
    },
    {
      heading: "Our responsibility",
      body: [
        "We work to keep Jonz running and your house’s information safe, but it’s provided as it is, and we can’t promise it will always be available or free of mistakes.",
        "As far as the law allows, we aren’t liable for indirect losses, or for what housemates owe or do to each other, and our total liability to you is limited to what you paid us in the 12 months before the claim. Nothing in these terms limits what the law doesn’t let us limit, like liability for death or injury caused by negligence, for fraud, or your statutory rights as a consumer.",
      ],
    },
    {
      heading: "Apple and Google",
      body: [
        "If you use Jonz from the App Store, these terms are between you and us, not Apple. Apple isn’t responsible for Jonz or its content, has no duty to support it, and isn’t liable for claims about it, including product liability, legal compliance or intellectual property claims. If Jonz fails to meet a warranty, you can tell Apple and it will refund the purchase price, if any. Apple and its subsidiaries can enforce these terms as a third party. The same goes for Google and Google Play.",
      ],
    },
    {
      heading: "The law",
      body: [
        `These terms are governed by the law of ${LEGAL.law}, and disputes go to its courts. If you’re a consumer living elsewhere, you keep the protections of your own country’s law and can bring a claim in your own courts.`,
      ],
    },
    {
      heading: "Changes to these terms",
      body: [
        "If we change these terms in a way that matters, we’ll say so in the app at least 30 days before. Using Jonz after that means you accept them; if you don’t, you can cancel and delete your account.",
      ],
    },
    {
      heading: "Contact",
      body: [`Questions, refunds, or anything else: ${CONTACT}.`],
    },
  ],
};
