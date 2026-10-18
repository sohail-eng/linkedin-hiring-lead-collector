"use strict";

function classifyHiringPost(post) {
  const original = typeof post === "string" ? post : (post?.description || "");
  const text = String(original)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  const lower = text.toLowerCase();

  if (!text || text.length < 35) {
    return {
      decision: "CONFUSE",
      confidence: 0.2,
      reason: "Missing or insufficient post text"
    };
  }

  const seeking = /\b(?:i(?:'m| am) (?:actively )?(?:looking|seeking|searching|open to)|open to work|open to opportunities|seeking (?:a |my )?(?:new )?(?:role|job|opportunity)|looking for (?:my |a )?(?:next |new )?(?:job|role)|available for (?:hire|work)|please (?:refer|hire) me)\b/i;
  const explicitNoJob = /\b(?:not a direct job offer|not (?:a|an) (?:actual )?job (?:offer|opening)|self-funded training programme|course fees apply)\b/i;
  const tutorial = /\b(?:free online courses?|course[s]? (?:with certificates|for beginners)|learn programming|python (?:roadmap|cheat sheet|mastery|tutorial|interview questions|3\.15|3\.14)|coding (?:humor|joke)|day \d+ of python|learning python|my (?:latest |new )?(?:project|blog)|introducing (?:python|my project)|built (?:an? |my )?(?:ai |python )?(?:job hunter|hiring lead collector)|job (?:hunter|collector) (?:tool|extension)|published .*projects? on github|job market statistics analysis|python tech stats|download (?:the )?(?:exclusive )?(?:sample )?report|market (?:research|analysis)|read (?:our |my )?(?:latest )?(?:article|newsletter)|job hunting (?:websites|tips)|websites (?:that pay|to find|to explore)|platforms (?:to find|for finding)|interview preparation|resume template|handwritten notes|python vs javascript)\b/i;
  const jobboardList = /\b(?:essential websites to explore|here are websites|\d+ (?:websites|platforms) (?:to|for) (?:find|explore)|remote job platforms|job boards? (?:for|to))\b/i;
  const title = /\b(?:software engineer|software developer|python developer|fastapi developer|backend (?:developer|engineer)|full[ -]?stack developer|data engineer|data analyst|ai\/ml engineer|ml engineer|sdk engineer|security engineer|devops engineer|application security engineer|cyber ?security engineer|odoo developer|qa engineer|ui\/ux designer|snowflake data engineer|interns?|engineer\s*[-–]\s*i)\b/i;
  const intent = /\b(?:we(?:'re| are) hiring|(?:is|are) hiring|hiring\s*[:|–-]?|#hiring\b|open positions?|vacanc(?:y|ies)|job openings?|job opportunity|career opportunity|looking for (?:a |an |talented |skilled |experienced |male |female )?(?:python|software|backend|full.stack|ai\/ml|data|odoo|qa|ui\/ux|intern)|seeking (?:an? |experienced |skilled )?(?:python|software|backend|ai\/ml|data)|join our team|interested candidates please apply|apply (?:now|here|for)|send (?:your|us) (?:updated )?(?:cv|resume)|job title\s*:|position\s*:)\b/i;
  const concrete = /\b(?:location\s*:|work (?:location|mode|type)\s*:|experience\s*:|job (?:type|role|title|details)\s*:|position\s*:|salary\s*:|required skills|key responsibilities|qualification\s*:|employment type\s*:|onsite|on-site|hybrid|remote|full.time|contract|openings\s*:)\b/i;
  const apply = /\b(?:apply\s*(?:here|now|link|at|:)|send (?:your|us) (?:updated )?(?:cv|resume)|dm (?:your |me (?:your )?)?cv|email (?:your|us)|share (?:your|updated) (?:cv|resume)|submit (?:your |an )?application|interested candidates please apply)\b|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i;
  const listing = /\b(?:jobs? alert|handpicked openings|\d+\.\s*(?:python|backend|senior|lead|junior)|(?:job|role)\s*:\s*(?:python|software|ai\/ml|data)|(?:is|are) expanding (?:their|our) (?:team|devops))\b/i;
  const noRole = /\b(?:connect with potential (?:career )?opportunities|help you navigate your job search|exploring (?:suitable |other )?(?:career )?opportunities|job search assistance|recruitment support)\b/i;

  if (/^(?:i am|i'm|open to work|seeking (?:a|my) (?:new )?(?:job|role))\b/i.test(lower) && seeking.test(lower)) {
    return { decision: "DENY", confidence: 0.99, reason: "First-person job seeker statement" };
  }
  if (explicitNoJob.test(lower)) {
    return { decision: "DENY", confidence: 0.99, reason: "Explicitly not a direct job offer" };
  }

  const hasTitle = title.test(lower);
  const hasIntent = intent.test(lower);
  const hasConcrete = concrete.test(lower);
  const hasApply = apply.test(lower);
  const hasListing = listing.test(lower);

  if (seeking.test(lower) && !hasIntent && !hasListing) {
    return { decision: "DENY", confidence: 0.97, reason: "Job seeker, not employer advertising a vacancy" };
  }
  if (/\b(?:hiring lead collector|job hunter that searches|recruitment (?:software|tool)|why hiring python developers is key|dedicated development talent for your business)\b/i.test(lower)) {
    return { decision: "DENY", confidence: 0.99, reason: "Recruitment-related tool or software services promotion" };
  }
  if (noRole.test(lower) && !/(?:job title\s*:|position\s*:|job id\s*:|(?:we(?:'re| are)|is) hiring)/i.test(lower)) {
    return { decision: "CONFUSE", confidence: 0.62, reason: "Generic recruiting outreach without a confirmed opening" };
  }
  if ((tutorial.test(lower) || jobboardList.test(lower)) &&
      !(hasTitle && (hasIntent || hasListing) && (hasConcrete || hasApply))) {
    return { decision: "DENY", confidence: 0.96, reason: "Educational, humorous, promotional, or general job-search content" };
  }
  if (hasTitle && (hasIntent || hasListing) && (hasConcrete || hasApply)) {
    return {
      decision: "KEEP",
      confidence: hasApply ? 0.95 : 0.84,
      reason: hasApply
        ? "Specific vacancy and applicant action identified"
        : "Specific advertised role with job details; application route may need checking"
    };
  }
  if (hasIntent && hasApply && (hasConcrete || hasListing)) {
    return { decision: "KEEP", confidence: 0.8, reason: "Recruitment call with application route and job details" };
  }
  if (hasTitle && hasIntent) {
    return { decision: "CONFUSE", confidence: 0.6, reason: "Hiring language and job title but insufficient actionable details" };
  }
  if (tutorial.test(lower) || jobboardList.test(lower)) {
    return { decision: "DENY", confidence: 0.92, reason: "Non-hiring informational content" };
  }
  if (!hasIntent && !hasListing) {
    return { decision: "DENY", confidence: 0.88, reason: "No evidence of an advertised opening" };
  }
  return { decision: "CONFUSE", confidence: 0.45, reason: "Insufficient evidence to distinguish vacancy from generic recruitment" };
}

globalThis.classifyHiringPost = classifyHiringPost;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { classifyHiringPost };
}
