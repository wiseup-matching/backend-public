import { RootFilterQuery, Types } from 'mongoose';
import {
  ZipCoords,
  JobPosting,
  JobPostingSchemaType,
  LanguageProficiencyLevel,
  LanguageProficiencyLevelDoc,
  Match,
  MatchingRun,
  MatchingRunSchemaType,
  Retiree,
  RetireeSchemaType,
  JobPostingDoc,
} from '../db/schema';
import { notifyUser } from './notifications';
import haversineDistance from 'haversine-distance';
import { getJobPostingIdsWithoutHiredRetirees } from '../api/routes/jobPosting';
import { matchingRunSchedule } from './cronJobs';

// Threshold for acceptable match score
// Startups are only notified about matches with a score above this threshold
const ACCEPTABLE_SCORE_THRESHOLD = 0.33;

/**
 * Creates a matching run for the given job posting ID or all job postings without hired retirees
 * if jobPostingId is not provided.
 * Assumption for algorithm efficiency: len(jobPostings) << len(retirees)
 * @param jobPostingId Optional ID of a specific job posting to match against retirees
 * @param retireeId Optional ID of a specific retiree to match against the job postings
 * @returns Promise resolving to the created matching run document
 */
export async function createMatchingRun({
  jobPostingId,
  retireeId,
}: {
  jobPostingId?: string;
  retireeId?: string;
}): Promise<MatchingRunSchemaType> {
  const jobPostingIds: string[] = jobPostingId
    ? [jobPostingId]
    : await getJobPostingIdsWithoutHiredRetirees();

  const languageProficiencyLevels = await LanguageProficiencyLevel.find();
  const matchingRun = (
    await MatchingRun.create({
      isFullRun: !jobPostingId && !retireeId,
    })
  ).toJSON();

  // find matches for each job posting
  for (const jobPostingId of jobPostingIds) {
    const jobPosting = await JobPosting.findById(jobPostingId);
    if (!jobPosting) {
      continue;
    }
    await findMatchesForJobPosting(
      jobPosting,
      languageProficiencyLevels,
      matchingRun._id.toString(),
      retireeId,
    );
  }

  // Notify startups about new acceptable matches if they have any
  const startupIds = (
    await JobPosting.distinct('startupId', {
      _id: { $in: jobPostingIds },
    })
  ).map((id) => id.toString());

  for (const startupId of startupIds) {
    const jobPostingIdsByStartup = jobPostingId
      ? [new Types.ObjectId(jobPostingId)]
      : await JobPosting.find({ startupId }).distinct('_id');
    const matchesAboveThresholdPreviously = await getAcceptableMatchesNumPerJobPosting(
      jobPostingIdsByStartup,
      matchingRun._id.toString(),
    );
    const matchesAboveThresholdNow =
      await getAcceptableMatchesNumPerJobPosting(jobPostingIdsByStartup);
    maybeNotifyStartupAboutNewMatches(
      startupId,
      matchesAboveThresholdNow - matchesAboveThresholdPreviously,
      jobPostingId,
    );
  }

  cleanupOldUnusedMatches();

  return matchingRun;
}

// Count unique retirees with acceptable matches for the given job postings
// Exclude matches from the specified matching run if provided
async function getAcceptableMatchesNumPerJobPosting(
  jobPostingIds: Types.ObjectId[],
  excludedMatchingRunId?: string,
): Promise<number> {
  const result = await Match.aggregate<{ count: number }>([
    {
      $match: {
        jobPosting: { $in: jobPostingIds },
        ...(excludedMatchingRunId
          ? { matchingRun: { $ne: new Types.ObjectId(excludedMatchingRunId) } }
          : {}),
        score: { $gte: ACCEPTABLE_SCORE_THRESHOLD },
      },
    },
    { $sort: { createdAt: -1 } }, // Ensure latest match per retiree
    {
      $group: {
        _id: '$retiree',
        match: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$match' } },
    { $count: 'count' },
  ]);

  // Return the count of unique retirees
  return result[0]?.count ?? 0;
}

/**
 * Cleans up old unused matches and matching runs.
 * A complete matching run is scheduled every {intervalMinutes} minutes.
 * Old and unused matches are defined as: older than {factor} times the {intervalMinutes}.
 * -> This guarantees that there will always be at least {factor} complete matching runs in the database.
 */
async function cleanupOldUnusedMatches() {
  const matchingRunInterval = matchingRunSchedule.intervalMinutes;
  const factor = 2;
  // delete matches older than {factor} times the matching run interval
  const cutoffDate = new Date(Date.now() - matchingRunInterval * 60 * 1000 * factor);
  const matchingRunsToDelete = await MatchingRun.find({
    createdAt: { $lt: cutoffDate },
  }).lean();
  if (matchingRunsToDelete.length > 0) {
    const matchingRunIds = matchingRunsToDelete.map((run) => run._id);
    await Match.deleteMany({ matchingRun: { $in: matchingRunIds } });
    await MatchingRun.deleteMany({ _id: { $in: matchingRunIds } });
  }
}

// Notifies a startup about new matches if existing
// links directly to the matches page with the correct
// job posting (only if the matching run is for a specific job posting)
function maybeNotifyStartupAboutNewMatches(
  startupId: string,
  newMatchesCount: number,
  jobPostingId: string | undefined,
): void {
  if (newMatchesCount <= 0) return;

  const message =
    newMatchesCount === 1
      ? '1 new match found for your job postings!'
      : `${newMatchesCount.toString()} new matches found for your job postings!`;

  notifyUser(startupId, {
    title: 'New Matches Found',
    message,
    read: false,
    actions: [
      {
        label: 'View Matches',
        url: `/startup/matches/${jobPostingId ?? ''}`,
      },
    ],
  });
}

/**
 * Finds matches between retirees and a given job posting
 * and creates Match documents for each match found.
 * @param jobPosting The job posting to match against retirees
 * @param languageProficiencyLevels The language proficiency levels to use for matching
 * @param matchingRunId The ID of the matching run
 * @param okMatchesNumPerStartup A map to keep track of the number of acceptable matches per startup
 * @param retireeId The ID of the retiree to match (optional), if set, only matches for this retiree will be found
 */
async function findMatchesForJobPosting(
  jobPosting: JobPostingDoc,
  languageProficiencyLevels: LanguageProficiencyLevelDoc[],
  matchingRunId: string,
  retireeId?: string,
): Promise<void> {
  // find retirees that could potentially match this job posting
  // for simplicity when testing with few retirees, we only use the country as a heuristic
  // in the future, if too many retirees are registered, we could use more sophisticated heuristics
  // to limit the number of retirees to match against
  // nevertheless, the requirements should not be too strict, as we also want to find non-perfect matches
  // non-perfect matches will then be punished by the scoring function
  const filter: RootFilterQuery<RetireeSchemaType> = {
    status: 'available',
    // expectedHourlySalary
    // allow retirees with salary expectations up to 20% higher than the job posting
    // expectedHourlySalaryEUR: { $lte: (jobPosting?.approxHourlySalaryEUR ?? Infinity) * 1.2 },
    // desiredWorkHoursPerWeek
    // allow retirees with desired work hours per week up to 20% lower than the job posting
    // desiredWorkHoursPerWeek: { $gte: (jobPosting?.approxHoursPerWeek ?? 0) * 0.8 },
  };
  if (jobPosting.requiredCountry) {
    filter.addressCountry = jobPosting.requiredCountry;
  }
  if (retireeId) {
    filter._id = retireeId;
  }

  const possibleRetirees: (RetireeSchemaType & { _id: Types.ObjectId })[] =
    await Retiree.find(filter);

  // compute matching score
  for (const retiree of possibleRetirees) {
    const score = await calcScoreForRetireeAndJobPosting(
      retiree,
      jobPosting,
      languageProficiencyLevels,
    );

    await Match.create({
      matchingRun: matchingRunId,
      jobPosting: jobPosting._id.toString(),
      retiree: retiree._id,
      score,
    });
  }
}

// --------- Retiree-Job-Posting Matching Score Calculation ---------

// Calculates the matching score for a retiree and a job posting.
// Returns a score between 0 and 1, where 1 is a perfect match.
async function calcScoreForRetireeAndJobPosting(
  retiree: RetireeSchemaType,
  jobPosting: JobPostingSchemaType,
  languageProficiencyLevels: LanguageProficiencyLevelDoc[],
): Promise<number> {
  const scores: { score: number; maxScore: number }[] = [];

  // skills
  scores.push(calcSkillScore(retiree, jobPosting));

  // expertise areas
  scores.push(calcExpertiseScore(retiree, jobPosting));

  // languages
  scores.push(calcLanguageScore(retiree, jobPosting, languageProficiencyLevels));

  // hours per week
  scores.push(calcHoursPerWeekScore(retiree, jobPosting));

  // salary expectations
  scores.push(calcSalaryExpectationsScore(retiree, jobPosting));

  // job positions
  scores.push(calcJobPositionScore(retiree, jobPosting));

  // degrees
  scores.push(calcDegreeScore(retiree, jobPosting));

  // location
  scores.push(await calcLocationScore(retiree, jobPosting));

  const totalScore = scores.reduce((accScore, current) => accScore + current.score, 0);
  const maxTotalScore = scores.reduce((accMaxScore, current) => accMaxScore + current.maxScore, 0);

  const normScore = maxTotalScore > 0 ? totalScore / maxTotalScore : 0;

  return normScore;
}

// Converts a ratio (0 to 1) to a score (0 to 100).
// Rewards higher ratios more heavily, e.g.:
// 0.1 -> 1, 0.5 -> 25, 0.75 -> 56, 0.9 -> 81, 1 -> 100
function ratioToScore(ratio: number): number {
  // return ratio * 100; // uncomment for linear scores
  return Math.floor(Math.pow(ratio * 10, 2));
}

// Symmetric normalized difference
// This function returns a value between 0 and 1,
// where 0 means no difference and 1 means maximum difference.
function getSymNormDiff(a: number, b: number): number {
  return Math.abs(a - b) / (a + b);
}

// Calculates the score for the skills of a retiree matching the job posting.
// Returns a score between 0 and 100, depending of the percentage of pleased required skills.
function calcSkillScore(
  retiree: RetireeSchemaType,
  jobPosting: JobPostingSchemaType,
): { score: number; maxScore: number } {
  const matchingSkills = jobPosting.matchingSkills.filter((skill) =>
    retiree.skills.some((retireeSkill) => retireeSkill._id.toString() === skill._id.toString()),
  );
  const ratio = matchingSkills.length / (jobPosting.matchingSkills.length || 1);
  return {
    score: ratioToScore(ratio),
    maxScore: ratioToScore(1),
  };
}

// Calculates the score for the expertise areas of a retiree matching the job posting.
// Returns a score between 0 and 100, depending of the percentage of pleased required expertise
// areas.
function calcExpertiseScore(
  retiree: RetireeSchemaType,
  jobPosting: JobPostingSchemaType,
): { score: number; maxScore: number } {
  const matchingExpertise = jobPosting.matchingExpertiseAreas.filter((area) =>
    retiree.expertiseAreas.some(
      (retireeArea) => retireeArea._id.toString() === area._id.toString(),
    ),
  );
  const ratio = matchingExpertise.length / (jobPosting.matchingExpertiseAreas.length || 1);
  return {
    score: ratioToScore(ratio),
    maxScore: ratioToScore(1),
  };
}

// compares two language proficiency levels
// returns true if level a is sufficiently high or equal to level b
// e.g. A1 >= A1, A2 >= A1, C1 >= B2, C2 >= C1
// alphanumeric comparison can be used for simplicity
function languageProficiencyGtEqual(
  aId: string,
  bId: string,
  languageProficiencyLevels: LanguageProficiencyLevelDoc[],
): boolean {
  const aLevel = languageProficiencyLevels.find((level) => level._id.toString() === aId);
  const bLevel = languageProficiencyLevels.find((level) => level._id.toString() === bId);
  if (!aLevel || !bLevel) return false;
  return aLevel.level.localeCompare(bLevel.level) >= 0;
}

function calcLanguageScore(
  retiree: RetireeSchemaType,
  jobPosting: JobPostingSchemaType,
  languageProficiencyLevels: LanguageProficiencyLevelDoc[],
): { score: number; maxScore: number } {
  const pleasedLanguages = jobPosting.matchingLanguageProficiencies.filter((language) =>
    retiree.languageProficiencies.some(
      (retireeLanguage) =>
        language.languageId.toString() === retireeLanguage.languageId.toString() &&
        languageProficiencyGtEqual(
          retireeLanguage.levelId.toString(),
          language.levelId.toString(),
          languageProficiencyLevels,
        ),
    ),
  );
  const pleasedLanguagesRatio =
    pleasedLanguages.length / (jobPosting.matchingLanguageProficiencies.length || 1);
  return {
    score: ratioToScore(pleasedLanguagesRatio),
    maxScore: ratioToScore(1),
  };
}

// Calculates the score for the approximate hours per week of a retiree matching the job posting.
// Returns a score between 0 and 100, depending symmetric normalized difference
// between the two values. The less difference, the better.
function calcHoursPerWeekScore(
  retiree: RetireeSchemaType,
  jobPosting: JobPostingSchemaType,
): { score: number; maxScore: number } {
  if (jobPosting.approxHoursPerWeek && retiree.desiredWorkHoursPerWeek) {
    const symNormDiff = getSymNormDiff(
      jobPosting.approxHoursPerWeek,
      retiree.desiredWorkHoursPerWeek,
    );
    // the less difference, the better
    return {
      score: ratioToScore(1 - symNormDiff),
      maxScore: ratioToScore(1),
    };
  }
  return { score: 0, maxScore: 0 };
}

// Calculates the score for the expected hourly salary of a retiree matching the job posting.
// Returns a score between 0 and 100, depending symmetric normalized difference
// between the two values. The less difference, the better.
function calcSalaryExpectationsScore(
  retiree: RetireeSchemaType,
  jobPosting: JobPostingSchemaType,
): { score: number; maxScore: number } {
  if (jobPosting.approxHourlySalaryEUR && retiree.expectedHourlySalaryEUR) {
    const symNormDiff = getSymNormDiff(
      jobPosting.approxHourlySalaryEUR,
      retiree.expectedHourlySalaryEUR,
    );
    // the less difference, the better
    return {
      score: ratioToScore(1 - symNormDiff),
      maxScore: ratioToScore(1),
    };
  }
  return { score: 0, maxScore: 0 };
}

// Calculates the score for the job positions of a retiree matching the job posting.
// Returns a score between 0 and 100, depending on whether the retiree has at least one
// matching position in the job posting's required positions.
// at least one position matches -> score 100, otherwise 0
function calcJobPositionScore(
  retiree: RetireeSchemaType,
  jobPosting: JobPostingSchemaType,
): { score: number; maxScore: number } {
  if (jobPosting.matchingPositions.length === 0) {
    return { score: 0, maxScore: 0 };
  }

  const retireePositions = retiree.careerElements
    .filter((careerElement) => careerElement.kind === 'job')
    .map((careerElement) => careerElement.position)
    .filter((position) => position !== undefined && position !== null);

  const pleasedPositions = jobPosting.matchingPositions.filter((position) =>
    retireePositions.some(
      (retireePosition) => retireePosition._id.toString() === position._id.toString(),
    ),
  );

  // it is sufficient to have at least one matching position
  return {
    score: pleasedPositions.length > 0 ? 100 : 0,
    maxScore: 100,
  };
}

// Calculates the score for the degrees of a retiree matching the job posting.
// Returns a score between 0 and 100, depending on whether the retiree has at least one
// matching degree in the job posting's required degrees.
// at least one degree matches -> score 100, otherwise 0
function calcDegreeScore(
  retiree: RetireeSchemaType,
  jobPosting: JobPostingSchemaType,
): { score: number; maxScore: number } {
  if (jobPosting.matchingDegrees.length === 0) {
    return { score: 0, maxScore: 0 };
  }

  const retireeDegrees = retiree.careerElements
    .filter((careerElement) => careerElement.kind === 'education')
    .map((careerElement) => careerElement.degree)
    .filter((degree) => degree !== undefined && degree !== null);

  const pleasedDegrees = jobPosting.matchingDegrees.filter((degree) =>
    retireeDegrees.some((retireeDegree) => retireeDegree._id.toString() === degree._id.toString()),
  );

  // it is sufficient to have at least one matching degree
  return {
    score: pleasedDegrees.length > 0 ? 100 : 0,
    maxScore: 100,
  };
}

// Calculates the score for the location of a retiree matching the job posting.
// Returns a score between 0 and 100, depending on the distance between the retiree
// and the job posting's required location.
// Returns 100 if location matches exactly, otherwise a score based on the
// linear distance between the center coordinates of the two zip code areas.
async function calcLocationScore(
  retiree: RetireeSchemaType,
  jobPosting: JobPostingSchemaType,
): Promise<{ score: number; maxScore: number }> {
  if (
    !jobPosting.requiredZip ||
    !jobPosting.requiredCountry ||
    !retiree.addressZip ||
    !retiree.addressCountry
  ) {
    return { score: 0, maxScore: 0 };
  }

  const isMatch =
    jobPosting.requiredCity === retiree.addressCity &&
    jobPosting.requiredCountry === retiree.addressCountry;
  if (isMatch) {
    return { score: 100, maxScore: 100 };
  }

  const retireeCoords = await ZipCoords.findOne({
    zip: retiree.addressZip,
    country: retiree.addressCountry,
  }).lean();
  const jobCoords = await ZipCoords.findOne({
    zip: jobPosting.requiredZip,
    country: jobPosting.requiredCountry,
  }).lean();

  if (!retireeCoords || !jobCoords) {
    return { score: 0, maxScore: 0 };
  }

  const distanceKm = haversineDistance(retireeCoords, jobCoords) / 1000;
  // 0 km = 100, 1000 km = 0
  const score = Math.max(0, 100 - distanceKm / 10); // 10 km per score point
  return { score, maxScore: 100 };
}
