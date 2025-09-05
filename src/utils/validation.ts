import { z } from 'zod';

// --- Common Patterns ---
const URL_PATTERN = /^(https?:\/\/)?([\w.-]+\.[a-z]{2,})(\/\S*)?$/i;
const ZIP_PATTERN = /^\d{5}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENT_YEAR = new Date().getFullYear();

// --- Reusable Field Schemas ---
export const firstName = z.string().min(2, 'First name must be at least 2 characters').max(50);
export const lastName = z.string().min(2, 'Last name must be at least 2 characters').max(50);
export const email = z.string().regex(EMAIL_PATTERN, 'Invalid email address');
export const zip = z.string().regex(ZIP_PATTERN, 'ZIP code must be exactly 5 digits');
export const url = z.string().regex(URL_PATTERN, 'Invalid URL format');
export const aboutMe = z.string().max(500, 'About Me must be less than 500 characters').optional();
export const salary = z
  .number()
  .min(0, 'Salary must be positive')
  .max(1000, 'Salary cannot exceed €1000/hour');
export const hoursPerWeek = z
  .number()
  .min(0, 'Hours must be positive')
  .max(40, 'Cannot exceed 40 hours/week');
export const foundingYear = z
  .number()
  .min(1900, 'Year must be after 1900')
  .max(CURRENT_YEAR, 'Year cannot be in the future');
export const city = z.string().min(2, 'City must be at least 2 characters').max(50);
export const country = z.string().min(2, 'Country must be at least 2 characters').max(50);
export const street = z.string().min(3, 'Street address must be at least 3 characters').max(100);

// Additional reusable schemas
export const title = z.string().min(2, 'Startup name is required');
export const industry = z.string().min(2, 'Industry is required');
export const aboutUs = z.string().min(10, 'About Us must be at least 10 characters');

// --- Arrays ---
export const skills = z.array(z.string()).max(10, 'Maximum 10 skills');
export const expertiseAreas = z.array(z.string()).max(5, 'Maximum 5 expertise areas');

// --- Career Element (Job/Education) ---
export const careerElement = z
  .object({
    kind: z.enum(['job', 'education']),
    title: z.string().min(2, 'Title must be at least 2 characters'),
    fromDate: z.coerce.date(),
    untilDate: z.coerce.date().optional(),
    description: z.string().max(500, 'Description must be below 500 characters').optional(),
    organizationName: z.string().min(2, 'Organization must be at least 2 characters').optional(),
    finalGrade: z.string().optional(),
    degree: z.string().optional(),
    position: z.string().optional(),
  })
  .refine(
    (data) => {
      if (!data.untilDate) return true;
      return data.fromDate < data.untilDate;
    },
    {
      message: 'From date must be before until date',
      path: ['untilDate'],
    },
  );

// --- Retiree Schema ---
export const retireeSchema = z
  .object({
    nameFirst: firstName.optional(),
    nameLast: lastName.optional(),
    email,
    aboutMe,
    birthday: z.coerce.date().optional(),
    retiredSince: z.coerce.date().optional(),
    approxHourlySalaryEUR: salary.optional(),
    approxHoursPerWeek: hoursPerWeek.optional(),
    addressStreet: street.optional(),
    addressZip: zip.optional(),
    addressCity: city.optional(),
    addressCountry: country.optional(),
    status: z.enum(['available', 'atcapacity']).default('available'),
    skills: z.array(z.string()).max(10, 'Maximum 10 skills').optional(),
    expertiseAreas: z.array(z.string()).max(5, 'Maximum 5 expertise areas').optional(),
    languageProficiencies: z
      .array(
        z.object({
          languageId: z.string(),
          levelId: z.string(),
        }),
      )
      .max(10)
      .optional(),
    careerElements: z.array(careerElement).optional(),
  })
  .refine(
    (data) => {
      // Complex date validation: birthday vs retiredSince
      if (!data.birthday || !data.retiredSince) return true;

      if (data.birthday > data.retiredSince) {
        return false;
      }

      const diffYears =
        (data.retiredSince.getTime() - data.birthday.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      return diffYears >= 20;
    },
    {
      message: 'Retirement must be at least 20 years after birthday',
      path: ['retiredSince'],
    },
  );

// --- Startup Schema ---
export const startupSchema = z.object({
  title: title.optional(),
  industry: industry.optional(),
  aboutUs: aboutUs.optional(),
  addressCity: city.optional(),
  addressCountry: country.optional(),
  fundingStatus: z.string().optional(),
  fulltimeEmployeesNum: z.number().min(0, 'Cannot be negative').optional(),
  foundingYear: foundingYear.optional(),
  revenuePerYearEUR: z.number().min(0, 'Cannot be negative').optional(),
  imprintUrl: url.optional(),
  websiteUrl: url.optional(),
  contactPersonNameFirst: firstName.optional(),
  contactPersonNameLast: lastName.optional(),
});

// --- Job Posting Schema ---
export const jobPostingSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(1000),
  startupId: z.string().min(1, 'Startup ID is required'),
  requiredZip: z
    .string()
    .regex(ZIP_PATTERN, 'ZIP code must be exactly 5 digits')
    .nullable()
    .optional(),
  requiredCity: city.min(2).max(20).nullable().optional(),
  requiredCountry: country.min(5).max(20).nullable().optional(),
  desiredStartDate: z.coerce.date().optional(),
  approxDurationWeeks: z.number().min(1).max(52).optional(),
  approxHoursPerWeek: z.number().min(1).max(40).optional(),
  approxDaysPerWeek: z.number().min(1).max(5).optional(),
  approxHourlySalaryEUR: z
    .number()
    .min(0, 'Hourly salary cannot be negative')
    .max(1000, 'Hourly salary seems too high, please adjust')
    .optional(),
  matchingSkills: z.array(z.string()).max(10, 'Maximum 10 skills').optional(),
  matchingExpertiseAreas: z.array(z.string()).max(5, 'Maximum 5 expertise areas').optional(),
  matchingDegrees: z.array(z.string()).optional(),
  matchingPositions: z.array(z.string()).optional(),
  matchingLanguageProficiencies: z
    .array(
      z.object({
        languageId: z.string(),
        levelId: z.string(),
      }),
    )
    .optional(),
});

// --- Cooperation Schema ---
export const cooperationSchema = z.object({
  jobPostingId: z.string().min(1, 'Job posting ID is required'),
  retireeId: z.string().min(1, 'Retiree ID is required'),
  status: z.enum(['pending', 'accepted', 'declined']).default('pending'),
  message: z.string().max(1000, 'Message must be less than 1000 characters').optional(),
});

// --- Message Schema ---
export const messageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message content is required')
    .max(1000, 'Message must be less than 1000 characters'),
  read: z.boolean().default(false),
});

// --- Partial Schemas for Updates ---
export const partialRetireeSchema = z
  .object({
    nameFirst: firstName.optional(),
    nameLast: lastName.optional(),
    email: email.optional(),
    aboutMe: z.string().max(500, 'About Me must be less than 500 characters').nullable().optional(),
    birthday: z.coerce.date().optional(),
    retiredSince: z.coerce.date().optional(),
    approxHourlySalaryEUR: z.coerce
      .number()
      .min(0, 'Salary must be positive')
      .max(1000, 'Salary cannot exceed €1000/hour')
      .optional(),
    approxHoursPerWeek: z.coerce
      .number()
      .min(0, 'Hours must be positive')
      .max(40, 'Cannot exceed 40 hours/week')
      .optional(),
    // Alternative field names that frontend might use
    expectedHourlySalaryEUR: z.coerce
      .number()
      .min(0, 'Salary must be positive')
      .max(1000, 'Salary cannot exceed €1000/hour')
      .optional(),
    desiredWorkHoursPerWeek: z.coerce
      .number()
      .min(0, 'Hours must be positive')
      .max(40, 'Cannot exceed 40 hours/week')
      .optional(),
    addressStreet: z
      .string()
      .min(3, 'Street address must be at least 3 characters')
      .max(100)
      .nullable()
      .optional(),
    addressZip: z
      .string()
      .regex(ZIP_PATTERN, 'ZIP code must be exactly 5 digits')
      .nullable()
      .optional(),
    addressCity: z
      .string()
      .min(2, 'City must be at least 2 characters')
      .max(50)
      .nullable()
      .optional(),
    addressCountry: z
      .string()
      .min(2, 'Country must be at least 2 characters')
      .max(50)
      .nullable()
      .optional(),
    status: z.enum(['available', 'atcapacity']).optional(),
    skills: z.array(z.string()).max(10, 'Maximum 10 skills').optional(),
    expertiseAreas: z.array(z.string()).max(5, 'Maximum 5 expertise areas').optional(),
    languageProficiencies: z
      .array(
        z.object({
          languageId: z.string(),
          levelId: z.string(),
        }),
      )
      .max(10)
      .optional(),
    careerElements: z.array(careerElement).optional(),
  })
  .passthrough(); // Allow additional fields that might be sent by frontend

export const partialStartupSchema = z
  .object({
    // Core startup fields
    title: title.optional(),
    industry: industry.optional(),
    aboutUs: aboutUs.optional(),
    addressCity: city.optional(),
    addressCountry: country.optional(),
    fundingStatus: z.string().min(1, 'Funding status is required').optional(),
    fulltimeEmployeesNum: z.coerce.number().min(0, 'Cannot be negative').optional(),
    foundingYear: z.coerce
      .number()
      .min(1900, 'Year must be after 1900')
      .max(CURRENT_YEAR, 'Year cannot be in the future')
      .optional(),
    revenuePerYearEUR: z.coerce.number().min(0, 'Cannot be negative').optional(),
    imprintUrl: url.optional(),
    websiteUrl: url.optional(),

    // Contact person fields
    contactPersonNameFirst: z
      .string()
      .min(2, 'First name must be at least 2 characters')
      .max(50)
      .optional(),
    contactPersonNameLast: z
      .string()
      .min(2, 'Last name must be at least 2 characters')
      .max(50)
      .optional(),
    contactPersonPicture: z.string().nullable().optional(),

    // Additional fields from schema
    logoUrl: z.string().nullable().optional(),
    stripeCustomerId: z.string().optional(),
    stripePriceId: z.string().optional(),
    stripeSubscriptionExpiryDate: z.coerce.date().optional(),
    wiseUpSubscriptionTier: z.enum(['free', 'silver', 'gold']).optional(),
    monthlyConnectionBalance: z.number().optional(),
    permanentConnectionBalance: z.number().optional(),
    jobPostings: z.array(z.string()).optional(),

    // User base fields
    email: email.optional(),
    passwordHash: z.string().optional(),
    createdAt: z.coerce.date().optional(),
    notifications: z.array(z.any()).optional(),
    userType: z.enum(['Startup']).optional(),
  })
  .passthrough(); // Allow additional fields that might be sent by frontend

export const partialJobPostingSchema = z.object({
  title: title.min(3).max(100).optional(),
  description: z.string().min(10).max(1000).optional(),
  requiredZip: z
    .string()
    .regex(ZIP_PATTERN, 'ZIP code must be exactly 5 digits')
    .nullable()
    .optional(),
  requiredCity: city.min(2).max(20).nullable().optional(),
  requiredCountry: country.min(5).max(20).nullable().optional(),
  desiredStartDate: z.coerce.date().optional(),
  approxDurationWeeks: z.number().min(1).max(52).optional(),
  approxHoursPerWeek: z.number().min(1).max(40).optional(),
  approxDaysPerWeek: z.number().min(1).max(5).optional(),
  approxHourlySalaryEUR: salary.optional(),
  matchingSkills: skills.optional(),
  matchingExpertiseAreas: expertiseAreas.optional(),
  matchingDegrees: z.array(z.string()).optional(),
  matchingPositions: z.array(z.string()).optional(),
  matchingLanguageProficiencies: z
    .array(
      z.object({
        languageId: z.string(),
        levelId: z.string(),
      }),
    )
    .optional(),
  startupId: z.string().optional(),
});

export const partialCooperationSchema = cooperationSchema.partial();
