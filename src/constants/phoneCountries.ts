// src/constants/phoneCountries.ts

export type PhoneCountry = {
  code: string;
  name: string;
  dialCode: string;
};

export const PHONE_COUNTRIES = [
  { code: 'AU', name: 'Australia', dialCode: '61' },
  { code: 'US', name: 'United States', dialCode: '1' },
  { code: 'CA', name: 'Canada', dialCode: '1' },
  { code: 'KR', name: 'South Korea', dialCode: '82' },
  { code: 'NZ', name: 'New Zealand', dialCode: '64' },
  { code: 'GB', name: 'United Kingdom', dialCode: '44' },
  { code: 'JP', name: 'Japan', dialCode: '81' },
  { code: 'CN', name: 'China', dialCode: '86' },
  { code: 'HK', name: 'Hong Kong', dialCode: '852' },
  { code: 'TW', name: 'Taiwan', dialCode: '886' },
  { code: 'SG', name: 'Singapore', dialCode: '65' },
  { code: 'IN', name: 'India', dialCode: '91' },
  { code: 'ID', name: 'Indonesia', dialCode: '62' },
  { code: 'MY', name: 'Malaysia', dialCode: '60' },
  { code: 'TH', name: 'Thailand', dialCode: '66' },
  { code: 'VN', name: 'Vietnam', dialCode: '84' },
  { code: 'PH', name: 'Philippines', dialCode: '63' },
  { code: 'FR', name: 'France', dialCode: '33' },
  { code: 'DE', name: 'Germany', dialCode: '49' },
  { code: 'ES', name: 'Spain', dialCode: '34' },
  { code: 'IT', name: 'Italy', dialCode: '39' },
  { code: 'PT', name: 'Portugal', dialCode: '351' },
  { code: 'NL', name: 'Netherlands', dialCode: '31' },
  { code: 'BE', name: 'Belgium', dialCode: '32' },
  { code: 'CH', name: 'Switzerland', dialCode: '41' },
  { code: 'AT', name: 'Austria', dialCode: '43' },
  { code: 'SE', name: 'Sweden', dialCode: '46' },
  { code: 'NO', name: 'Norway', dialCode: '47' },
  { code: 'DK', name: 'Denmark', dialCode: '45' },
  { code: 'FI', name: 'Finland', dialCode: '358' },
  { code: 'IE', name: 'Ireland', dialCode: '353' },
  { code: 'PL', name: 'Poland', dialCode: '48' },
  { code: 'TR', name: 'Türkiye', dialCode: '90' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '971' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '966' },
  { code: 'BR', name: 'Brazil', dialCode: '55' },
  { code: 'MX', name: 'Mexico', dialCode: '52' },
  { code: 'AR', name: 'Argentina', dialCode: '54' },
  { code: 'CL', name: 'Chile', dialCode: '56' },
  { code: 'ZA', name: 'South Africa', dialCode: '27' },
] as const satisfies readonly PhoneCountry[];

export const DEFAULT_PHONE_COUNTRY_CODE = 'AU' as const;

export function findPhoneCountry(code: string) {
  return PHONE_COUNTRIES.find((country) => country.code === code);
}
