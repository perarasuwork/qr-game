/* ---------------------------------------------------------------------------
 * questions.js — question bank for UPS Scan & Solve
 *
 * Two sections, 5 questions each, pitched at medium difficulty:
 *   UPS — the client domain: tracking, routing, terminology, billing, delivery
 *   QA  — the craft: testing types, severity vs priority, UAT, test design
 *
 * TO EDIT: change the text below and save. No build step, no tools needed.
 *
 *   category : 'UPS' or 'QA' (used for the score breakdown)
 *   question : shown on the participant's PHONE after they scan the QR
 *   options  : shown on the LAPTOP / projector screen
 *   answer   : index into options — keep the correct answer FIRST (0);
 *              the app always shuffles option order on screen
 *   explain  : shown on the laptop after the answer is locked in
 *
 * NOTE: the UPS answers were drafted from general operational knowledge.
 * Have an SME or your L&D team confirm them against your own material before
 * running the session.
 * ------------------------------------------------------------------------- */

const CATEGORIES = ['UPS', 'QA'];

const QUESTIONS = [
  /* ===================================================================
   * UPS — 5 questions
   * =================================================================== */
  {
    category: 'UPS',
    question: 'Most UPS tracking numbers begin with which two characters?',
    options: ['1Z', 'UP', 'PS', '9X'],
    answer: 0,
    explain: 'The standard UPS tracking number starts with "1Z", followed by the shipper number, a service level indicator, the package sequence and a check digit.'
  },
  {
    category: 'UPS',
    question: 'What is the UPS ORION system used for?',
    options: [
      'Working out the most efficient stop sequence for a driver\'s route',
      'Scanning barcodes on the sort belt',
      'Storing signatures collected at delivery',
      'Calculating customs duties on international parcels'
    ],
    answer: 0,
    explain: 'ORION (On-Road Integrated Optimization and Navigation) optimises the order of stops on each route. Small savings in miles per driver per day add up enormously across the fleet.'
  },
  {
    category: 'UPS',
    question: 'In UPS terminology, what is a "package car"?',
    options: [
      'The local delivery vehicle that makes customer stops',
      'A tractor-trailer moving volume between facilities',
      'A rail wagon used for bulk freight',
      'The trolley used to move parcels inside a hub'
    ],
    answer: 0,
    explain: 'Package cars are the brown vehicles making the actual customer deliveries. Feeders are the tractor-trailers that move volume between hubs and centres.'
  },
  {
    category: 'UPS',
    question: 'What does "dimensional weight" mean when pricing a shipment?',
    options: [
      'A billable weight worked out from the package size, used when it exceeds the actual weight',
      'The weight of the packaging material on its own',
      'The combined weight of every package on one route',
      'The maximum weight a conveyor belt can carry'
    ],
    answer: 0,
    explain: 'A big, light box takes up space that cannot be sold to anyone else, so carriers bill on volume whenever the dimensional weight works out higher than the scale weight.'
  },
  {
    category: 'UPS',
    question: 'What does POD stand for, and what does it record?',
    options: [
      'Proof of Delivery — evidence a shipment arrived, such as a signature or photo',
      'Point of Dispatch — the facility a shipment left from',
      'Package on Demand — a same-day collection request',
      'Priority Overnight Delivery — the fastest service level'
    ],
    answer: 0,
    explain: 'Proof of Delivery is the record that a shipment reached its destination: date, time, location and usually a signature or a photograph of the package where it was left.'
  },

  /* ===================================================================
   * QA — 5 questions
   * =================================================================== */
  {
    category: 'QA',
    question: 'What is the purpose of smoke testing?',
    options: [
      'A quick check that a new build\'s critical features work before deeper testing starts',
      'An exhaustive run of every test case in the suite',
      'Testing only the changes made since the last release',
      'Load testing the application until it fails'
    ],
    answer: 0,
    explain: 'Smoke testing answers "is this build stable enough to bother testing?". If the critical paths fail, the build is rejected early rather than wasting a full test cycle.'
  },
  {
    category: 'QA',
    question: 'What is regression testing meant to catch?',
    options: [
      'Existing features that have broken because of a recent change',
      'Defects in features that have never been released',
      'Performance drops under heavy user load',
      'Spelling and layout problems in the user interface'
    ],
    answer: 0,
    explain: 'A change in one place can break something that was already working. Regression testing re-runs existing coverage to confirm the change did not cause collateral damage.'
  },
  {
    category: 'QA',
    question: 'The company logo is misspelled on the home page. How would this defect normally be classified?',
    options: [
      'Low severity, high priority',
      'High severity, high priority',
      'Low severity, low priority',
      'High severity, low priority'
    ],
    answer: 0,
    explain: 'Severity is technical impact, priority is how urgently it must be fixed. Nothing is broken functionally, so severity is low, but the brand damage on the home page makes it urgent.'
  },
  {
    category: 'QA',
    question: 'Who normally performs User Acceptance Testing (UAT)?',
    options: [
      'The business users or the client, checking the system meets their real needs',
      'The developers who wrote the code',
      'An automated suite running in the build pipeline',
      'The infrastructure team, before deployment'
    ],
    answer: 0,
    explain: 'UAT is the final gate before go-live. It asks a different question from system testing: not "does it work as specified" but "does it actually do the job the business needs".'
  },
  {
    category: 'QA',
    question: 'A field accepts values from 1 to 100. Which values would boundary value analysis test?',
    options: [
      'The edges and just outside them — 0, 1, 100 and 101',
      'Every value from 1 to 100',
      'Only values in the middle, such as 50',
      'Only invalid values, such as -5 and 500'
    ],
    answer: 0,
    explain: 'Defects cluster at boundaries, because that is where off-by-one mistakes live. Testing the edges and the values immediately either side finds far more bugs than sampling the middle.'
  }
];

if (typeof module !== 'undefined' && module.exports) module.exports = { QUESTIONS, CATEGORIES };
