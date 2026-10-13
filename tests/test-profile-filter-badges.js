const fs = require('fs');
const path = require('path');
const { check, section, summary } = require('./helpers');

if (typeof document === 'undefined') {
  global.document = {
    createElement: () => {
      let content = '';
      return {
        set textContent(val) { content = val; },
        get innerHTML() { return content; }
      };
    }
  };
}

async function loadFrontendUtils() {

  const source = fs.readFileSync(
    path.join(__dirname, '..', 'frontend', 'js', 'utils.js'),
    'utf8'
  );
  return await import('data:text/javascript,' + encodeURIComponent(source));
}

(async () => {
  const utils = await loadFrontendUtils();
  const { shouldShowProfileBadge, renderProfileBadge } = utils;

  const profile1 = { id: 'p1', name: 'Work', color: '#EF4444' };
  const profile2 = { id: 'p2', name: 'Personal', color: '#3B82F6' };
  const profile3 = { id: 'p3', name: 'Hobby', color: '#10B981' };
  const twoProfiles = [profile1, profile2];
  const threeProfiles = [profile1, profile2, profile3];
  const singleProfile = [profile1];

  section('Filter with 2 profiles active: records only exist in 1 profile');
  {
    // Exact user scenario: 2 profiles active in filter, p1 has 0 records, p2 has records
    const filter = ['p1', 'p2'];
    const recordProfiles = ['p2', 'p2', 'p2'];
    check(
      shouldShowProfileBadge(filter, twoProfiles, recordProfiles) === true,
      'Badge shows when filter has 2 profiles even if only 1 profile has records'
    );

    const badge = renderProfileBadge(profile2);
    check(badge.includes('Personal'), 'Badge markup includes profile name');
    check(badge.includes('#3B82F6'), 'Badge markup includes profile color');
  }

  section('Filter with 3 profiles active: records only exist in 1 profile');
  {
    const filter = ['p1', 'p2', 'p3'];
    const recordProfiles = ['p3'];
    check(
      shouldShowProfileBadge(filter, threeProfiles, recordProfiles) === true,
      'Badge shows when filter has 3 profiles even if only 1 profile has records'
    );
  }

  section('Filter with "all" profiles active: user has multiple profiles');
  {
    const filter = 'all';
    const recordProfiles = ['p2'];
    check(
      shouldShowProfileBadge(filter, twoProfiles, recordProfiles) === true,
      'Badge shows when "all" is active and user has >1 profile, even if only 1 has records'
    );
  }

  section('Filter with "all" profiles active: user has only 1 profile total in account');
  {
    const filter = 'all';
    const recordProfiles = ['p1'];
    check(
      shouldShowProfileBadge(filter, singleProfile, recordProfiles) === false,
      'Badge suppressed when user only owns a single profile in total'
    );
  }

  section('Single profile filter active: only 1 profile selected');
  {
    const filter = ['p1'];
    const recordProfiles = ['p1', 'p1'];
    check(
      shouldShowProfileBadge(filter, twoProfiles, recordProfiles) === false,
      'Badge suppressed when filter explicitly selects only 1 profile'
    );
  }

  section('Default state (null filter, active profile only)');
  {
    const filter = null;
    const recordProfiles = ['p1', 'p1'];
    check(
      shouldShowProfileBadge(filter, twoProfiles, recordProfiles) === false,
      'Badge suppressed in default single-profile mode when records belong to active profile'
    );
  }

  section('Items span multiple profiles regardless of filter');
  {
    const filter = null;
    const recordProfiles = ['p1', 'p2'];
    check(
      shouldShowProfileBadge(filter, twoProfiles, recordProfiles) === true,
      'Badge shows when records span >1 profile even if filter is null'
    );
  }

  section('Comma-separated filter string with multiple profiles');
  {
    const filter = 'p1,p2';
    const recordProfiles = ['p2'];
    check(
      shouldShowProfileBadge(filter, twoProfiles, recordProfiles) === true,
      'Badge shows with comma-separated multi-profile filter string'
    );
  }

  summary();
})();
