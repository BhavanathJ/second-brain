const supabase = require('../config/supabase');

async function listCalendarEvents(profileId, { start, end } = {}) {
    let query = supabase
        .from('calendar_events')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .order('starts_at', { ascending: true });

    if (start) query = query.gte('starts_at', start);
    if (end) query = query.lte('starts_at', end);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

async function getCalendarEventById(profileId, eventId) {
    const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('profile_id', profileId)
        .eq('id', eventId)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function createCalendarEvent(profileId, { title, starts_at, ends_at, location }) {
    const { data, error } = await supabase
        .from('calendar_events')
        .insert({
            profile_id: profileId,
            title,
            starts_at: starts_at,
            ends_at: ends_at ?? null,
            location: location ?? null,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}
async function updateCalendarEvent(profileId, eventId, fields) {
    const { data, error } = await supabase
        .from('calendar_events')
        .update({ ...fields })
        .eq('profile_id', profileId)
        .eq('id', eventId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function softDeleteCalendarEvent(profileId, eventId) {
    const { data, error } = await supabase
        .from('calendar_events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('id', eventId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function restoreCalendarEvent(profileId, eventId) {
    const { data, error } = await supabase
        .from('calendar_events')
        .update({ deleted_at: null })
        .eq('profile_id', profileId)
        .eq('id', eventId)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function hardDeleteCalendarEvent(profileId, eventId) {
    const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('profile_id', profileId)
        .eq('id', eventId);

    if (error) throw error;
}

// Used by the unified /api/calendar endpoint — fetches events
// within a date range for the calendar view.
async function getEventsForRange(profileId, startDate, endDate) {
    const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .gte('starts_at', startDate)
        .lte('starts_at', endDate)
        .order('starts_at', { ascending: true });

    if (error) throw error;
    return data;
}

module.exports = {
    listCalendarEvents,
    getCalendarEventById,
    createCalendarEvent,
    updateCalendarEvent,
    softDeleteCalendarEvent,
    restoreCalendarEvent,
    hardDeleteCalendarEvent,
    getEventsForRange,
};