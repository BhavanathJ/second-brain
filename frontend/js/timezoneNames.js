/**
 * Friendly timezone name mappings for display purposes.
 * Maps IANA timezone identifiers to "Country (City)" format.
 * Falls back to raw IANA name if not in this mapping.
 *
 * Curated for major cities by population/usage.
 * For zones not listed, the raw IANA identifier is used.
 */

export const TIMEZONE_FRIENDLY_NAMES = {
  // Asia
  'Asia/Kolkata': 'India (Kolkata)',
  'Asia/Mumbai': 'India (Mumbai)',
  'Asia/Delhi': 'India (Delhi)',
  'Asia/Shanghai': 'China (Shanghai)',
  'Asia/Beijing': 'China (Beijing)',
  'Asia/Tokyo': 'Japan (Tokyo)',
  'Asia/Seoul': 'South Korea (Seoul)',
  'Asia/Singapore': 'Singapore (Singapore)',
  'Asia/Hong_Kong': 'Hong Kong (Hong Kong)',
  'Asia/Taipei': 'Taiwan (Taipei)',
  'Asia/Bangkok': 'Thailand (Bangkok)',
  'Asia/Jakarta': 'Indonesia (Jakarta)',
  'Asia/Manila': 'Philippines (Manila)',
  'Asia/Kuala_Lumpur': 'Malaysia (Kuala Lumpur)',
  'Asia/Ho_Chi_Minh': 'Vietnam (Ho Chi Minh City)',
  'Asia/Dhaka': 'Bangladesh (Dhaka)',
  'Asia/Karachi': 'Pakistan (Karachi)',
  'Asia/Tehran': 'Iran (Tehran)',
  'Asia/Dubai': 'UAE (Dubai)',
  'Asia/Riyadh': 'Saudi Arabia (Riyadh)',
  'Asia/Baghdad': 'Iraq (Baghdad)',
  'Asia/Jerusalem': 'Israel (Jerusalem)',
  'Asia/Amman': 'Jordan (Amman)',
  'Asia/Beirut': 'Lebanon (Beirut)',
  'Asia/Damascus': 'Syria (Damascus)',
  'Asia/Kabul': 'Afghanistan (Kabul)',
  'Asia/Yekaterinburg': 'Russia (Yekaterinburg)',
  'Asia/Omsk': 'Russia (Omsk)',
  'Asia/Krasnoyarsk': 'Russia (Krasnoyarsk)',
  'Asia/Irkutsk': 'Russia (Irkutsk)',
  'Asia/Yakutsk': 'Russia (Yakutsk)',
  'Asia/Vladivostok': 'Russia (Vladivostok)',
  'Asia/Magadan': 'Russia (Magadan)',
  'Asia/Kamchatka': 'Russia (Kamchatka)',
  'Asia/Anadyr': 'Russia (Anadyr)',

  // Europe
  'Europe/London': 'UK (London)',
  'Europe/Paris': 'France (Paris)',
  'Europe/Berlin': 'Germany (Berlin)',
  'Europe/Rome': 'Italy (Rome)',
  'Europe/Madrid': 'Spain (Madrid)',
  'Europe/Amsterdam': 'Netherlands (Amsterdam)',
  'Europe/Brussels': 'Belgium (Brussels)',
  'Europe/Vienna': 'Austria (Vienna)',
  'Europe/Warsaw': 'Poland (Warsaw)',
  'Europe/Stockholm': 'Sweden (Stockholm)',
  'Europe/Oslo': 'Norway (Oslo)',
  'Europe/Copenhagen': 'Denmark (Copenhagen)',
  'Europe/Helsinki': 'Finland (Helsinki)',
  'Europe/Moscow': 'Russia (Moscow)',
  'Europe/Kiev': 'Ukraine (Kyiv)',
  'Europe/Kyiv': 'Ukraine (Kyiv)',
  'Europe/Istanbul': 'Turkey (Istanbul)',
  'Europe/Athens': 'Greece (Athens)',
  'Europe/Lisbon': 'Portugal (Lisbon)',
  'Europe/Dublin': 'Ireland (Dublin)',
  'Europe/Zurich': 'Switzerland (Zurich)',
  'Europe/Prague': 'Czech Republic (Prague)',
  'Europe/Budapest': 'Hungary (Budapest)',
  'Europe/Bucharest': 'Romania (Bucharest)',
  'Europe/Sofia': 'Bulgaria (Sofia)',
  'Europe/Belgrade': 'Serbia (Belgrade)',
  'Europe/Zagreb': 'Croatia (Zagreb)',
  'Europe/Ljubljana': 'Slovenia (Ljubljana)',
  'Europe/Bratislava': 'Slovakia (Bratislava)',
  'Europe/Vilnius': 'Lithuania (Vilnius)',
  'Europe/Riga': 'Latvia (Riga)',
  'Europe/Tallinn': 'Estonia (Tallinn)',
  'Europe/Chisinau': 'Moldova (Chisinau)',
  'Europe/Minsk': 'Belarus (Minsk)',
  'Europe/Kaliningrad': 'Russia (Kaliningrad)',
  'Europe/Samara': 'Russia (Samara)',
  'Europe/Volgograd': 'Russia (Volgograd)',
  'Europe/Ulyanovsk': 'Russia (Ulyanovsk)',
  'Europe/Astrakhan': 'Russia (Astrakhan)',

  // North America
  'America/New_York': 'USA (New York)',
  'America/Chicago': 'USA (Chicago)',
  'America/Denver': 'USA (Denver)',
  'America/Los_Angeles': 'USA (Los Angeles)',
  'America/Anchorage': 'USA (Anchorage)',
  'America/Honolulu': 'USA (Honolulu)',
  'America/Toronto': 'Canada (Toronto)',
  'America/Vancouver': 'Canada (Vancouver)',
  'America/Montreal': 'Canada (Montreal)',
  'America/Edmonton': 'Canada (Edmonton)',
  'America/Winnipeg': 'Canada (Winnipeg)',
  'America/Halifax': 'Canada (Halifax)',
  'America/St_Johns': 'Canada (St. John\'s)',
  'America/Mexico_City': 'Mexico (Mexico City)',
  'America/Guatemala': 'Guatemala (Guatemala City)',
  'America/Managua': 'Nicaragua (Managua)',
  'America/Tegucigalpa': 'Honduras (Tegucigalpa)',
  'America/San_Salvador': 'El Salvador (San Salvador)',
  'America/Costa_Rica': 'Costa Rica (San José)',
  'America/Panama': 'Panama (Panama City)',
  'America/Havana': 'Cuba (Havana)',
  'America/Jamaica': 'Jamaica (Kingston)',
  'America/Port-au-Prince': 'Haiti (Port-au-Prince)',
  'America/Santo_Domingo': 'Dominican Republic (Santo Domingo)',
  'America/Puerto_Rico': 'Puerto Rico (San Juan)',
  'America/Detroit': 'USA (Detroit)',
  'America/Indiana/Indianapolis': 'USA (Indianapolis)',
  'America/Kentucky/Louisville': 'USA (Louisville)',
  'America/Phoenix': 'USA (Phoenix)',
  'America/Boise': 'USA (Boise)',

  // South America
  'America/Sao_Paulo': 'Brazil (São Paulo)',
  'America/Buenos_Aires': 'Argentina (Buenos Aires)',
  'America/Santiago': 'Chile (Santiago)',
  'America/Lima': 'Peru (Lima)',
  'America/Bogota': 'Colombia (Bogotá)',
  'America/Caracas': 'Venezuela (Caracas)',
  'America/La_Paz': 'Bolivia (La Paz)',
  'America/Montevideo': 'Uruguay (Montevideo)',
  'America/Asuncion': 'Paraguay (Asunción)',
  'America/Guayaquil': 'Ecuador (Guayaquil)',
  'America/Paramaribo': 'Suriname (Paramaribo)',
  'America/Cayenne': 'French Guiana (Cayenne)',

  // Africa
  'Africa/Cairo': 'Egypt (Cairo)',
  'Africa/Johannesburg': 'South Africa (Johannesburg)',
  'Africa/Lagos': 'Nigeria (Lagos)',
  'Africa/Nairobi': 'Kenya (Nairobi)',
  'Africa/Casablanca': 'Morocco (Casablanca)',
  'Africa/Algiers': 'Algeria (Algiers)',
  'Africa/Tunis': 'Tunisia (Tunis)',
  'Africa/Tripoli': 'Libya (Tripoli)',
  'Africa/Khartoum': 'Sudan (Khartoum)',
  'Africa/Addis_Ababa': 'Ethiopia (Addis Ababa)',
  'Africa/Dar_es_Salaam': 'Tanzania (Dar es Salaam)',
  'Africa/Kampala': 'Uganda (Kampala)',
  'Africa/Kigali': 'Rwanda (Kigali)',
  'Africa/Lusaka': 'Zambia (Lusaka)',
  'Africa/Harare': 'Zimbabwe (Harare)',
  'Africa/Luanda': 'Angola (Luanda)',
  'Africa/Kinshasa': 'DR Congo (Kinshasa)',
  'Africa/Libreville': 'Gabon (Libreville)',
  'Africa/Brazzaville': 'Congo (Brazzaville)',
  'Africa/Douala': 'Cameroon (Douala)',
  'Africa/Abidjan': 'Ivory Coast (Abidjan)',
  'Africa/Accra': 'Ghana (Accra)',
  'Africa/Dakar': 'Senegal (Dakar)',
  'Africa/Bamako': 'Mali (Bamako)',
  'Africa/Ouagadougou': 'Burkina Faso (Ouagadougou)',
  'Africa/Nouakchott': 'Mauritania (Nouakchott)',
  'Africa/Conakry': 'Guinea (Conakry)',
  'Africa/Freetown': 'Sierra Leone (Freetown)',
  'Africa/Banjul': 'Gambia (Banjul)',
  'Africa/Monrovia': 'Liberia (Monrovia)',
  'Africa/Porto-Novo': 'Benin (Porto-Novo)',
  'Africa/Lome': 'Togo (Lomé)',
  'Africa/Niamey': 'Niger (Niamey)',
  'Africa/Ndjamena': 'Chad (N\'Djamena)',
  'Africa/Bangui': 'Central African Republic (Bangui)',
  'Africa/Malabo': 'Equatorial Guinea (Malabo)',
  'Africa/Sao_Tome': 'São Tomé and Príncipe (São Tomé)',
  'Africa/Moroni': 'Comoros (Moroni)',
  'Africa/Victoria': 'Seychelles (Victoria)',
  'Africa/Maseru': 'Lesotho (Maseru)',
  'Africa/Mbabane': 'Eswatini (Mbabane)',
  'Africa/Gaborone': 'Botswana (Gaborone)',
  'Africa/Windhoek': 'Namibia (Windhoek)',
  'Africa/Maputo': 'Mozambique (Maputo)',
  'Africa/Blantyre': 'Malawi (Blantyre)',
  'Africa/Bujumbura': 'Burundi (Bujumbura)',

  // Oceania
  'Pacific/Auckland': 'New Zealand (Auckland)',
  'Pacific/Fiji': 'Fiji (Suva)',
  'Pacific/Guam': 'Guam (Hagåtña)',
  'Pacific/Honolulu': 'USA (Honolulu)',
  'Pacific/Port_Moresby': 'Papua New Guinea (Port Moresby)',
  'Pacific/Noumea': 'New Caledonia (Nouméa)',
  'Pacific/Tarawa': 'Kiribati (Tarawa)',
  'Pacific/Majuro': 'Marshall Islands (Majuro)',
  'Pacific/Funafuti': 'Tuvalu (Funafuti)',
  'Pacific/Wallis': 'Wallis and Futuna (Mata-Utu)',
  'Pacific/Apia': 'Samoa (Apia)',
  'Pacific/Tongatapu': 'Tonga (Nuku\'alofa)',
  'Pacific/Chatham': 'New Zealand (Chatham Islands)',

  // Australia
  'Australia/Sydney': 'Australia (Sydney)',
  'Australia/Melbourne': 'Australia (Melbourne)',
  'Australia/Brisbane': 'Australia (Brisbane)',
  'Australia/Perth': 'Australia (Perth)',
  'Australia/Adelaide': 'Australia (Adelaide)',
  'Australia/Darwin': 'Australia (Darwin)',
  'Australia/Hobart': 'Australia (Hobart)',
  'Australia/Eucla': 'Australia (Eucla)',
  'Australia/Lord_Howe': 'Australia (Lord Howe Island)',
};

/**
 * Get a friendly display name for a timezone.
 * Returns "Country (City)" if known, otherwise returns the IANA identifier.
 *
 * @param {string} ianaZone - IANA timezone identifier (e.g., "Asia/Kolkata")
 * @returns {string} Friendly name or IANA identifier
 */
export function getTimezoneDisplayLabel(ianaZone, offsetStr = '') {
  const friendly = TIMEZONE_FRIENDLY_NAMES[ianaZone];
  if (friendly) {
    return offsetStr ? `${friendly} — ${ianaZone} (${offsetStr})` : `${friendly} — ${ianaZone}`;
  }
  return offsetStr ? `${ianaZone} (${offsetStr})` : ianaZone;
}

/**
 * Get the friendly name only (without IANA or offset).
 * Used for display in compact spaces.
 *
 * @param {string} ianaZone - IANA timezone identifier
 * @returns {string} Friendly name or IANA identifier
 */
export function getFriendlyTimezoneName(ianaZone) {
  return TIMEZONE_FRIENDLY_NAMES[ianaZone] || ianaZone;
}