/**
 * Ghostwriter Project Configuration
 * ====================================
 * All project-specific settings live here.
 * To use this pipeline for a different book or publication:
 * 1. Duplicate this file
 * 2. Update the fields below
 * 3. Point the batch runner at the new config
 *
 * The pipeline (stages, validation, sentiment, gotchas) is fully generic.
 */

export interface GhostwriterProject {
  /** Short name used in reports */
  name: string;
  /** Publisher name */
  publisher: string;
  /** Target publication date */
  publicationDate: string;
  /** NotebookLM notebook ID containing curated Tier 1 sources */
  notebookLMId: string;
  /** NotebookLM notebook display name */
  notebookLMName: string;
  /** Map of chapter number to primary author */
  chapterAuthors: Record<number, string>;
  /** Target reader description — used in all prompts */
  targetReader: string;
  /** Directory containing chapter .md files */
  chaptersDir: string;
  /** Google Drive folder for author review packs (optional) */
  driveReviewDir?: string;
}

/** The Digital Law Firm — Law Society Publishing */
export const DIGITAL_LAW_FIRM: GhostwriterProject = {
  name: 'The Digital Law Firm',
  publisher: 'Law Society Publishing',
  publicationDate: 'Q4 2026',
  notebookLMId: '4af61e2f-a5c4-49c3-84d6-9926ac39e270',
  notebookLMName: 'The Digital Law Firm- HyperAutomation',
  chapterAuthors: {
    1: 'Rajiv Abeysinghe',
    2: 'Darren',
    3: 'Rajiv Abeysinghe',
    4: 'Rajiv Abeysinghe',
    5: 'Rajiv Abeysinghe / Sushila',
    6: 'Darren',
    7: 'Nick Lockett',
    8: 'Nick Lockett',
    9: 'Nick Lockett',
    10: 'Rajiv Abeysinghe',
    11: 'Darren',
    12: 'Darren',
  },
  targetReader: `A practice manager or senior partner in a UK high street or regional law firm.
Firm size: 4–25 fee earners. Regulated by the SRA. Practice areas: conveyancing, probate, employment, commercial property.
This person is time-poor, change-sceptical, and accountable for outcomes.`,
  chaptersDir: `${process.env.HOME}/Downloads/Digital_Law_Firm_Chapters`,
  driveReviewDir: `${process.env.HOME}/Library/CloudStorage/GoogleDrive-rajabey68@gmail.com/My Drive/Digital Law firms/First Author Review`,
};

/** Active project — change this to switch projects */
export const ACTIVE_PROJECT = DIGITAL_LAW_FIRM;
