// src/lib/server/training/eligibility.ts
// Training Readiness — SP7 Task 3: Training eligibility classifier.
// Pure function, no I/O. Determines consent scope, privacy class, and
// training eligibility from request kind and retrieved collections.

import type { ConsentScope, PrivacyClass, TrainingEligibility } from './types.js';

export interface EligibilityInput {
  requestKind: string;
  retrievedCollections: string[];
}

export interface EligibilityResult {
  consentScope: ConsentScope;
  privacyClass: PrivacyClass;
  trainingEligibility: TrainingEligibility;
  trainingEligibilityReason: string;
}

export function classifyEligibility(input: EligibilityInput): EligibilityResult {
  const hasPrivate = input.retrievedCollections.includes('beau_private');

  // Step 1: Consent scope
  let consentScope: ConsentScope;
  if (input.requestKind === 'manual.prompt') {
    consentScope = 'user_content';
  } else if (hasPrivate) {
    consentScope = 'mixed';
  } else {
    consentScope = 'beau_output';
  }

  // Step 2: Privacy class
  let privacyClass: PrivacyClass;
  if (hasPrivate || consentScope === 'mixed') {
    privacyClass = 'private';
  } else if (consentScope === 'user_content') {
    privacyClass = 'trusted';
  } else {
    privacyClass = 'public';
  }

  // Step 3: Training eligibility (system defaults — no policy overlay in Stage 0)
  let trainingEligibility: TrainingEligibility;
  let trainingEligibilityReason: string;

  if (privacyClass === 'private') {
    trainingEligibility = 'never';
    trainingEligibilityReason = 'contains private memory fragments';
  } else if (consentScope === 'user_content') {
    trainingEligibility = 'trainable_after_redaction';
    trainingEligibilityReason =
      'user-initiated prompt — output trainable, input requires review/redaction';
  } else {
    trainingEligibility = 'eval_only';
    trainingEligibilityReason = 'beau_output — default before policy authorship';
  }

  return { consentScope, privacyClass, trainingEligibility, trainingEligibilityReason };
}
