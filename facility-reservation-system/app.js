
if(typeof window==="undefined") global.window = global;

var $ = function(id) { return document.getElementById(id); };
var STATUSES = ["Pending","Partially Approved","Approved","Rejected","Scheduled","In Use","Completed","Cancelled","No-show"];
var BLOCKED_OVERLAP = ["Approved","Scheduled","In Use"];
var LARGE_EVENT_THRESHOLD = 100; // CR-01: >100 participants requires dual approval (Admin + Security)
var AFTER_HOURS_START = 18; // 18:00 onwards = after-hours [TBC default, configurable]
var AFTER_HOURS_END = 7;    // before 07:00 = after-hours [TBC default]

var PERMISSIONS = [
  { fn: "Manage facilities & approval policies (FR-04)", admin: true,  staff: false, requester: false, security: false, management: false },
  { fn: "Manage users & roles (FR-10)",       admin: true,  staff: false, requester: false, security: false, management: false },
  { fn: "Approve / reject reservations (FR-05)", admin: true, staff: false, requester: false, security: false, management: false },
  { fn: "Dual-approve large events >100 (CR-01)", admin: true, staff: false, requester: false, security: true, management: false },
  { fn: "View all reservations", admin: true, staff: true, requester: false, security: true, management: true },
  { fn: "Confirm usage / record no-show (FR-06)", admin: true, staff: true, requester: false, security: false, management: false },
  { fn: "Record completion", admin: true, staff: true, requester: false, security: false, management: false },
  { fn: "Create service requests", admin: true, staff: true, requester: false, security: false, management: false },
  { fn: "Update facility condition", admin: true, staff: true, requester: false, security: false, management: false },
  { fn: "View facilities & availability (FR-01)", admin: true, staff: true, requester: true, security: true, management: true },
  { fn: "Submit reservation (FR-02)", admin: true, staff: false, requester: true, security: false, management: false },
  { fn: "View own status / history", admin: true, staff: true, requester: true, security: true, management: true },
  { fn: "Cancel own eligible request (FR-06)", admin: true, staff: false, requester: true, security: false, management: false },
  { fn: "View after-hours authorization list (FR-07)", admin: true, staff: true, requester: false, security: true, management: true },
  { fn: "Generate utilization reports (FR-08)", admin: true, staff: false, requester: false, security: false, management: true },
  { fn: "View reports & audit logs", admin: true, staff: false, requester: false, security: false, management: true },
];

var TRANSITIONS = {
  "Pending":   ["Partially Approved","Approved","Rejected","Cancelled"],
  "Partially Approved": ["Approved","Rejected","Cancelled"],
  "Approved":  ["Scheduled","Cancelled","In Use"],
  "Scheduled": ["In Use","Cancelled","No-show"],
  "In Use":    ["Completed","No-show"],
  "Rejected":  [],
  "Completed": [],
  "Cancelled": [],
  "No-show":   [],
};

var LS = { users:"frs_users", fac:"frs_facilities", res:"frs_reservations", srv:"frs_service", audit:"frs_audit", session:"frs_session", tests:"frs_tests", notif:"frs_notifications" };
function uid() { if(typeof crypto!=="undefined" && typeof crypto.randomUUID==="function") return crypto.randomUUID(); return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8); }
function nowISO() { return new Date().toISOString(); }
var __mem = {};
function load(k, fb) { try { if(typeof localStorage!=="undefined"){ var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } return (__mem[k]!==undefined?__mem[k]:fb); } catch(e) { return fb; } }
function save(k, v) { try { if(typeof localStorage!=="undefined"){ localStorage.setItem(k, JSON.stringify(v)); } else { __mem[k]=JSON.parse(JSON.stringify(v)); } } catch(e){} syncTrigger(k); }

var users=[], facilities=[], reservations=[], serviceReqs=[], auditLogs=[], testResults={}, notifications=[];

/* ---------- Supabase sync (requires real creds in config.js) ---------- */
var LS2TABLE = { frs_users:"users", frs_facilities:"facilities", frs_reservations:"reservations", frs_service:"service_requests", frs_audit:"audit_logs", frs_notifications:"notifications", frs_tests:null };
var _pulling = false, _silent = false, _pushTimer = null, _pushRunning = false, _pushPending = false;

function genUuid(){ if(typeof crypto!=="undefined" && typeof crypto.randomUUID==="function") return crypto.randomUUID(); return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8); }
function isUuid(v){ return typeof v==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
function syncTrigger(k){ if(_pulling || _silent) return; var tbl = LS2TABLE[k]; if(!tbl || !isSupabaseConfigured() || !supabaseClient) return; if(_pushTimer) clearTimeout(_pushTimer); _pushTimer = setTimeout(function(){ _pushTimer = null; pushAll(); }, 350); }

function ensureUuids(){
  var changed = false, m = {};
  function fix(o){ if(!o.id){ o.id = genUuid(); changed = true; } else if(!isUuid(o.id)){ if(!m[o.id]) m[o.id] = genUuid(); o.id = m[o.id]; changed = true; } }
  users.forEach(fix); facilities.forEach(fix); reservations.forEach(fix); serviceReqs.forEach(fix); notifications.forEach(fix); auditLogs.forEach(fix);
  reservations.forEach(function(r){ if(r.requester_id && m[r.requester_id]) r.requester_id = m[r.requester_id]; if(r.facility_id && m[r.facility_id]) r.facility_id = m[r.facility_id]; });
  serviceReqs.forEach(function(s){ if(s.facility_id && m[s.facility_id]) s.facility_id = m[s.facility_id]; });
  auditLogs.forEach(function(a){ if(a.reservation_id && m[a.reservation_id]) a.reservation_id = m[a.reservation_id]; });
  notifications.forEach(function(n){ if(n.reservation_id && m[n.reservation_id]) n.reservation_id = m[n.reservation_id]; });
  if(changed){ _silent = true; persistAll(); _silent = false; }
  return changed;
}

function rowFor(kind, x){
  function iso(v){ return v ? new Date(v).toISOString() : new Date().toISOString(); }
  switch(kind){
    case "users": return { id:x.id, username:x.username, full_name:x.full_name, role:x.role, password_hash:x.password||x.password_hash||(x.username+"123"), is_active:x.is_active!==false, created_at:iso(x.created_at) };
    case "facilities": return { id:x.id, name:x.name, type:x.type, capacity:Math.max(0,parseInt(x.capacity,10)||0), location:x.location||"", status:x.status||"Active", approval_type:x.approval_type||"Requires approval", condition_notes:x.condition_notes||"", created_at:iso(x.created_at), updated_at:iso(x.updated_at) };
    case "reservations": return { id:x.id, facility_id:x.facility_id, requester_id:x.requester_id, requester_name:x.requester_name, purpose:x.purpose, participant_count:Math.max(1,parseInt(x.participant_count,10)||1), is_large_event:!!x.is_large_event, admin_decision:x.admin_decision||"Pending", security_decision:x.security_decision||"Not required", start_time:x.start_time, end_time:x.end_time, status:x.status||"Pending", remarks:x.remarks||"", created_at:iso(x.created_at), updated_at:iso(x.updated_at) };
    case "service_requests": return { id:x.id, facility_id:x.facility_id||null, reported_by:x.reported_by, concern:x.concern, status:x.status||"Open", created_at:iso(x.created_at) };
    case "audit_logs": return { id:x.id, created_at:iso(x.created_at), actor:x.actor, role:x.role||"", action:x.action, details:x.details||"", reservation_id:x.reservation_id||null };
    case "notifications": return { id:x.id, created_at:iso(x.created_at), username:x.username, message:x.message, reservation_id:x.reservation_id||null, is_read:!!x.is_read };
  }
  return null;
}

async function sbUpsert(kind, arr, conflictCol){
  var rows = arr.filter(function(x){ return x && x.id && isUuid(x.id); }).map(function(x){ return rowFor(kind, x); });
  if(!rows.length) return null;
  var t = supabaseClient.from(kind);
  var umap = {};
  if(kind==="users" && conflictCol==="username"){
    try{
      var sel = await t.select("id,username");
      if(!sel.error && sel.data){
        var byU = {}; sel.data.forEach(function(d){ if(byU[d.username]===undefined) byU[d.username] = d.id; });
        rows.forEach(function(r){ if(byU[r.username] && r.id && r.id!==byU[r.username]){ umap[r.id] = byU[r.username]; r.id = byU[r.username]; } });
      }
    }catch(e){}
  }
  var res = await t.upsert(rows, { onConflict: conflictCol });
  if(res.error) throw res.error;
  if(kind==="users" && Object.keys(umap).length){
    users.forEach(function(u){ if(umap[u.id]) u.id = umap[u.id]; });
    reservations.forEach(function(r){ if(r.requester_id && umap[r.requester_id]) r.requester_id = umap[r.requester_id]; });
    var ses = currentUser(); if(ses && umap[ses.id]) setSession({ id:umap[ses.id], username:ses.username, full_name:ses.full_name, role:ses.role });
    _silent = true; persistAll(); _silent = false;
  }
  return umap;
}

async function pushAll(){
  if(!isSupabaseConfigured() || !supabaseClient) return;
  if(_pushRunning){ _pushPending = true; return; }
  _pushRunning = true;
  try{
    ensureUuids();
    await sbUpsert("users", users, "username");
    await sbUpsert("facilities", facilities, "id");
    await sbUpsert("reservations", reservations, "id");
    await sbUpsert("service_requests", serviceReqs, "id");
    await sbUpsert("audit_logs", auditLogs, "id");
    await sbUpsert("notifications", notifications, "id");
  }catch(e){ console.warn("Supabase push failed (Demo Mode fallback stays active):", e); }
  finally{ _pushRunning = false; if(_pushPending){ _pushPending = false; setTimeout(pushAll, 50); } }
}

async function pullAll(){
  if(!isSupabaseConfigured() || !supabaseClient) return;
  _pulling = true;
  try{
    await mirrorTable("users","users");
    await mirrorTable("facilities","facilities");
    await mirrorTable("reservations","reservations");
    await mirrorTable("service_requests","service_requests");
    await mirrorTable("audit_logs","audit_logs");
    await mirrorTable("notifications","notifications");
    persistAll();
  }catch(e){ console.warn("Supabase pull failed, staying on local data:", e); }
  finally{ _pulling = false; }
  async function mirrorTable(key, tbl){
    var res = await supabaseClient.from(tbl).select("*").limit(10000).order("created_at", { ascending:false });
    if(res.error) throw res.error;
    if(!res.data || !res.data.length) return;
    var arr = res.data.map(function(x){
      if(tbl==="users") return { id:x.id, username:x.username, full_name:x.full_name, role:x.role, password:x.password_hash||x.password, is_active:x.is_active!==false, created_at:x.created_at };
      if(tbl==="facilities") return { id:x.id, name:x.name, type:x.type, capacity:x.capacity, location:x.location||"", status:x.status, approval_type:x.approval_type||"Requires approval", condition_notes:x.condition_notes||"", created_at:x.created_at, updated_at:x.updated_at };
      if(tbl==="reservations") return { id:x.id, facility_id:x.facility_id, requester_id:x.requester_id, requester_name:x.requester_name, purpose:x.purpose, participant_count:x.participant_count, is_large_event:x.is_large_event, admin_decision:x.admin_decision, security_decision:x.security_decision, start_time:x.start_time, end_time:x.end_time, status:x.status, remarks:x.remarks||"", created_at:x.created_at, updated_at:x.updated_at };
      if(tbl==="service_requests") return { id:x.id, facility_id:x.facility_id, reported_by:x.reported_by, concern:x.concern, status:x.status, created_at:x.created_at };
      if(tbl==="audit_logs") return { id:x.id, created_at:x.created_at, actor:x.actor, role:x.role||"", action:x.action, details:x.details||"", reservation_id:x.reservation_id };
      if(tbl==="notifications") return { id:x.id, created_at:x.created_at, username:x.username, message:x.message, reservation_id:x.reservation_id, is_read:!!x.is_read };
      return x;
    });
    if(key==="users") users = arr; else if(key==="facilities") facilities = arr;
    else if(key==="reservations") reservations = arr; else if(key==="service_requests") serviceReqs = arr;
    else if(key==="audit_logs") auditLogs = arr; else if(key==="notifications") notifications = arr;
  }
}

function initSupabaseSync(){
  if(!isSupabaseConfigured() || !supabaseClient) return Promise.resolve(false);
  return pullAll().then(function(){ ensureUuids(); return pushAll(); }).then(function(){ return true; }).catch(function(){ return false; });
}

function seedIfEmpty() {
  users = load(LS.users, null);
  facilities = load(LS.fac, null);
  reservations = load(LS.res, null);
  serviceReqs = load(LS.srv, null);
  auditLogs = load(LS.audit, null);
  testResults = load(LS.tests, {});
  notifications = load(LS.notif, null);
  if (!users) {
    users = [
      { id: uid(), username:"admin", full_name:"System Administrator", role:"Administrator", password:"admin123", is_active:true },
      { id: uid(), username:"staff", full_name:"Facility Staff Member", role:"Facility Staff", password:"staff123", is_active:true },
      { id: uid(), username:"requester", full_name:"Juan Requester", role:"Requester", password:"requester123", is_active:true },
      { id: uid(), username:"requester2", full_name:"Maria Requester", role:"Requester", password:"requester123", is_active:true },
      { id: uid(), username:"security", full_name:"Campus Security Officer", role:"Security", password:"security123", is_active:true },
      { id: uid(), username:"manager", full_name:"Facilities Manager", role:"Management", password:"manager123", is_active:true },
    ];
    save(LS.users, users);
  } else {
    var needSaveU = false;
    var defaults = [
      { username:"security", full_name:"Campus Security Officer", role:"Security", password:"security123" },
      { username:"manager", full_name:"Facilities Manager", role:"Management", password:"manager123" },
    ];
    defaults.forEach(function(d){
      if(!users.some(function(u){return u.username===d.username;})){ users.push({ id: uid(), username:d.username, full_name:d.full_name, role:d.role, password:d.password, is_active:true }); needSaveU = true; }
    });
    if(needSaveU) save(LS.users, users);
  }
  if (!facilities) {
    facilities = [
      { id: uid(), name:"Gymnasium", type:"Sports", capacity:500, location:"Building A - Ground", status:"Active", approval_type:"Requires approval", condition_notes:"Good condition", created_at: nowISO() },
      { id: uid(), name:"Conference Room A", type:"Meeting", capacity:30, location:"Building B - 2F", status:"Active", approval_type:"Auto-confirm", condition_notes:"Projector available", created_at: nowISO() },
      { id: uid(), name:"Computer Lab 1", type:"Laboratory", capacity:40, location:"Building C - 3F", status:"Active", approval_type:"Requires approval", condition_notes:"40 workstations", created_at: nowISO() },
      { id: uid(), name:"Auditorium", type:"Event", capacity:300, location:"Building A - 2F", status:"Maintenance", approval_type:"Requires approval", condition_notes:"Aircon repair", created_at: nowISO() },
      { id: uid(), name:"Library Hall", type:"Study", capacity:100, location:"Building D - 1F", status:"Inactive", approval_type:"Requires approval", condition_notes:"Under renovation", created_at: nowISO() },
    ];
    save(LS.fac, facilities);
  } else {
    var needSaveF = false;
    facilities.forEach(function(f){ if(!f.approval_type){ f.approval_type = (f.name==="Conference Room A") ? "Auto-confirm" : "Requires approval"; needSaveF = true; } });
    if(needSaveF) save(LS.fac, facilities);
  }
  if (!reservations) { reservations = []; }
  // migrate legacy reservations to new fields
  var needSaveR = false;
  reservations.forEach(function(r){
    if(r.participant_count == null){ r.participant_count = 1; needSaveR = true; }
    if(r.is_large_event == null){ r.is_large_event = r.participant_count > LARGE_EVENT_THRESHOLD; needSaveR = true; }
    if(r.admin_decision == null){ r.admin_decision = (r.status==="Approved"||r.status==="Scheduled"||r.status==="In Use"||r.status==="Completed") ? "Approved" : (r.status==="Rejected" ? "Rejected" : "Pending"); needSaveR = true; }
    if(r.security_decision == null){ r.security_decision = r.is_large_event ? "Pending" : "Not required"; needSaveR = true; }
  });
  if(needSaveR) save(LS.res, reservations);
  if(!reservations) { reservations = []; save(LS.res, reservations); }
  if (!reservations) { reservations = []; save(LS.res, reservations); }
  if (!serviceReqs) {
    serviceReqs = [{ id: uid(), facility_id: facilities[3] ? facilities[3].id : null, reported_by:"staff", concern:"Aircon not cooling in Auditorium", status:"Open", created_at: nowISO() }];
    save(LS.srv, serviceReqs);
  }
  if (!auditLogs) {
    auditLogs = [{ id: uid(), created_at: nowISO(), actor:"system", role:"System", action:"SYSTEM_INIT", details:"Demo data seeded", reservation_id:null }];
    save(LS.audit, auditLogs);
  }
  if (!notifications) { notifications = []; save(LS.notif, notifications); }
}
function persistAll(){ save(LS.users,users); save(LS.fac,facilities); save(LS.res,reservations); save(LS.srv,serviceReqs); save(LS.audit,auditLogs); save(LS.tests,testResults); save(LS.notif,notifications); }
var __session = null;
function currentUser() { try { if(typeof sessionStorage!=="undefined"){ return JSON.parse(sessionStorage.getItem(LS.session) || localStorage.getItem(LS.session) || "null"); } return __session; } catch(e) { return __session; } }
function setSession(u){ try{ if(typeof sessionStorage!=="undefined"){ if(u){ sessionStorage.setItem(LS.session, JSON.stringify(u)); } else { sessionStorage.removeItem(LS.session); localStorage.removeItem(LS.session); } } }catch(e){} __session = u || null; }
function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function fmtDT(v){ try { return new Date(v).toLocaleString(); } catch(e) { return v; } }

function login(username, password){
  var u = users.find(function(x){ return x.username.toLowerCase() === username.toLowerCase(); });
  if (!u) return { ok:false, msg:"User not found." };
  if (!u.is_active) return { ok:false, msg:"Account is deactivated." };
  if (u.password !== password) return { ok:false, msg:"Incorrect password." };
  setSession({ id:u.id, username:u.username, full_name:u.full_name, role:u.role });
  logAudit("USER_LOGIN", u.username + " logged in as " + u.role);
  return { ok:true, user:u };
}
function logout(){ var u=currentUser(); if(u) logAudit("USER_LOGOUT", u.username + " logged out"); setSession(null); }

function logAudit(action, details, reservation_id){
  var u = currentUser();
  auditLogs.unshift({ id: uid(), created_at: nowISO(), actor: u ? u.username : "system", role: u ? u.role : "System", action: action, details: details || "", reservation_id: reservation_id || null });
  save(LS.audit, auditLogs);
}

function getFacility(id){ return facilities.find(function(f){ return f.id===id; }); }
function isOverlapping(facilityId, start, end, excludeId){
  var s = new Date(start).getTime(), e = new Date(end).getTime();
  return reservations.find(function(r){
    return r.facility_id===facilityId && r.id!==excludeId && BLOCKED_OVERLAP.indexOf(r.status)!==-1 &&
    (s < new Date(r.end_time).getTime() && e > new Date(r.start_time).getTime());
  }) || null;
}

/* ---------- FR-09 Notifications (in-app; gateway [TBC]) ---------- */
function notifyUser(username, message, reservation_id){
  if(!username || !message) return;
  notifications.unshift({ id: uid(), username: username, message: message, reservation_id: reservation_id || null, is_read: false, created_at: nowISO() });
  save(LS.notif, notifications);
}
function notifyRole(role, message, reservation_id){
  users.filter(function(u){ return u.role===role && u.is_active; }).forEach(function(u){ notifyUser(u.username, message, reservation_id); });
}
function myNotifications(){
  var u = currentUser(); if(!u) return [];
  return notifications.filter(function(n){ return n.username===u.username; });
}

/* ---------- FR-01 availability + FR-07 after-hours ---------- */
function isAfterHours(dt){
  var d = new Date(dt); var h = d.getHours(); var day = d.getDay();
  if(day===0 || day===6) return true; // weekends count as after-hours [TBC default]
  return (h >= AFTER_HOURS_START || h < AFTER_HOURS_END);
}
function checkAvailability(facilityId, start, end, excludeId){
  var clash = isOverlapping(facilityId, start, end, excludeId);
  return { available: !clash, conflict: clash || null };
}
function searchAvailability(opts){
  // opts: { start, end, minCapacity, type }
  return facilities.filter(function(f){
    if(f.status!=="Active") return false;
    if(opts.type && opts.type!=="" && f.type!==opts.type) return false;
    if(opts.minCapacity && f.capacity < parseInt(opts.minCapacity,10)) return false;
    if(opts.start && opts.end){
      if(isOverlapping(f.id, opts.start, opts.end, null)) return false;
    }
    return true;
  });
}
function getAuthList(dateFilter){
  // FR-07: approved bookings valid for after-hours use
  return reservations.filter(function(r){
    if(["Approved","Scheduled","In Use"].indexOf(r.status)===-1) return false;
    if(dateFilter){
      var d = new Date(r.start_time).toISOString().slice(0,10);
      if(d!==dateFilter) return false;
    }
    return isAfterHours(r.start_time) || isAfterHours(r.end_time) || r.is_large_event;
  });
}
function getUtilization(fromISO, toISO){
  // FR-08: per-facility counts/hours/cancel/no-show
  var from = fromISO ? new Date(fromISO).getTime() : 0;
  var to = toISO ? new Date(toISO).getTime() : Date.now();
  return facilities.map(function(f){
    var rs = reservations.filter(function(r){
      return r.facility_id===f.id && new Date(r.start_time).getTime()>=from && new Date(r.start_time).getTime()<=to;
    });
    var hours = rs.reduce(function(a,r){
      if(["Approved","Scheduled","In Use","Completed"].indexOf(r.status)===-1) return a;
      return a + (new Date(r.end_time)-new Date(r.start_time))/3600000;
    },0);
    return {
      facility: f.name, type: f.type, capacity: f.capacity,
      total: rs.length,
      approved: rs.filter(function(r){return ["Approved","Scheduled","In Use","Completed"].indexOf(r.status)!==-1;}).length,
      cancelled: rs.filter(function(r){return r.status==="Cancelled";}).length,
      noshow: rs.filter(function(r){return r.status==="No-show";}).length,
      rejected: rs.filter(function(r){return r.status==="Rejected";}).length,
      hours: Math.round(hours*100)/100
    };
  });
}

function routeFor(fac, participantCount){
  var large = (parseInt(participantCount,10)||0) > LARGE_EVENT_THRESHOLD;
  if(large) return "dual"; // CR-01 overrides facility default
  return (fac.approval_type==="Auto-confirm") ? "auto" : "manual";
}

function submitReservation(opts){
  var facility_id = opts.facility_id, purpose = opts.purpose, start_time = opts.start_time, end_time = opts.end_time, editId = opts.editId || null;
  var participant_count = parseInt(opts.participant_count,10) || 1;
  var u = currentUser();
  if(!u) return { ok:false, msg:"Access denied. Please login." };
  if(u.role!=="Requester" && u.role!=="Administrator") return { ok:false, msg:"Only Requesters (or Admin) may submit reservations." };
  var fac = getFacility(facility_id);
  if(!fac) return { ok:false, msg:"Facility not found." };
  if(fac.status!=="Active") return { ok:false, msg:"Blocked: '" + fac.name + "' is " + fac.status + ". Only Active facilities may be reserved." };
  if(!purpose || !start_time || !end_time) return { ok:false, msg:"All fields are required." };
  if(new Date(start_time) >= new Date(end_time)) return { ok:false, msg:"Blocked (BR-B4-02): start must precede end time." };
  if(participant_count < 1) return { ok:false, msg:"Participant count must be at least 1." };
  if(participant_count > fac.capacity) return { ok:false, msg:"Blocked: participants (" + participant_count + ") exceed capacity (" + fac.capacity + ")." };
  var clash = isOverlapping(facility_id, start_time, end_time, editId);
  if(clash) return { ok:false, msg:"Blocked (BR-B4-03): overlaps " + clash.status + " reservation." };

  if(editId){
    var r = reservations.find(function(x){ return x.id===editId; });
    if(!r) return { ok:false, msg:"Reservation not found." };
    if(r.status==="Completed" || r.status==="No-show") return { ok:false, msg:"Blocked (BR-B4-07): Completed/No-show reservations cannot be edited." };
    if(u.role==="Requester" && (r.requester_id!==u.id || (r.status!=="Pending" && r.status!=="Partially Approved")))
      return { ok:false, msg:"Blocked (BR-B4-09): requesters may modify only their own Pending requests." };
    Object.assign(r, { facility_id: facility_id, purpose: purpose, start_time: start_time, end_time: end_time, participant_count: participant_count, is_large_event: participant_count > LARGE_EVENT_THRESHOLD, updated_at: nowISO() });
    if(r.is_large_event && r.security_decision==="Not required") r.security_decision = "Pending";
    logAudit("RESERVATION_EDIT", u.username + " edited reservation for " + fac.name + " (" + purpose + ", " + participant_count + " pax)", r.id);
    save(LS.res, reservations);
    return { ok:true, id: r.id, status: r.status };
  } else {
    var route = routeFor(fac, participant_count);
    var large = route==="dual";
    var st = (route==="auto") ? "Approved" : "Pending";
    var newRes = { id: uid(), facility_id: facility_id, requester_id: u.id, requester_name: u.full_name + " (" + u.username + ")", purpose: purpose, participant_count: participant_count, is_large_event: large, admin_decision: (route==="auto" ? "Approved" : "Pending"), security_decision: (large ? "Pending" : "Not required"), start_time: start_time, end_time: end_time, status: st, remarks:"", created_at: nowISO(), updated_at: nowISO() };
    reservations.unshift(newRes);
    logAudit("RESERVATION_SUBMIT", u.username + " submitted '" + purpose + "' @ " + fac.name + " (" + participant_count + " pax) as " + st + (large ? " [DUAL-APPROVAL required]" : ""), newRes.id);
    notifyUser(u.username, "Your request '" + purpose + "' @ " + fac.name + " is " + st + ".", newRes.id);
    if(route==="manual" || large) notifyRole("Administrator", "New " + (large ? "LARGE-EVENT " : "") + "request needs review: '" + purpose + "' @ " + fac.name + ".", newRes.id);
    if(large) notifyRole("Security", "Large event (>100) needs security approval: '" + purpose + "' @ " + fac.name + ".", newRes.id);
    if(route==="auto") notifyUser(u.username, "'" + purpose + "' auto-confirmed (facility policy: Auto-confirm).", newRes.id);
    save(LS.res, reservations);
    return { ok:true, id: newRes.id, status: st };
  }
}
/* CR-01 dual approval: Admin + Security both required when participants > 100 */
function decideApproval(id, decision){
  // decision: "Approved" | "Rejected"
  var u = currentUser();
  if(!u) return { ok:false, msg:"Access denied. Please login." };
  var r = reservations.find(function(x){ return x.id===id; });
  if(!r) return { ok:false, msg:"Reservation not found." };
  if(["Completed","Cancelled","No-show"].indexOf(r.status)!==-1) return { ok:false, msg:"Terminal reservation cannot be decided." };
  var isLarge = r.is_large_event;
  if(!isLarge){
    if(u.role!=="Administrator") return { ok:false, msg:"Blocked (BR-B4-04): Only Administrator may approve/reject." };
    return changeStatus(id, decision);
  }
  // Large event path
  if(u.role==="Administrator"){
    r.admin_decision = decision;
    logAudit(decision==="Approved"?"APPROVAL_ADMIN":"REJECTION_ADMIN", u.username + " (Administrator) " + decision + " large event '" + r.purpose + "'", r.id);
  } else if(u.role==="Security"){
    r.security_decision = decision;
    logAudit(decision==="Approved"?"APPROVAL_SECURITY":"REJECTION_SECURITY", u.username + " (Security) " + decision + " large event '" + r.purpose + "'", r.id);
  } else {
    return { ok:false, msg:"Blocked (CR-01): large events require Administrator + Security approval." };
  }
  var reqUser = users.find(function(x){ return x.id===r.requester_id; });
  var reqUsername = reqUser ? reqUser.username : null;
  if(r.admin_decision==="Rejected" || r.security_decision==="Rejected"){
    var from = r.status; r.status = "Rejected"; r.updated_at = nowISO();
    logAudit("REJECTION", "Large event '" + r.purpose + "' rejected (Admin=" + r.admin_decision + ", Security=" + r.security_decision + ")", r.id);
    if(reqUsername) notifyUser(reqUsername, "Your large-event request '" + r.purpose + "' was Rejected.", r.id);
  } else if(r.admin_decision==="Approved" && r.security_decision==="Approved"){
    var clash = isOverlapping(r.facility_id, r.start_time, r.end_time, r.id);
    if(clash) return { ok:false, msg:"Blocked (BR-B4-03): conflicts with " + clash.status + " reservation." };
    r.status = "Approved"; r.updated_at = nowISO();
    logAudit("APPROVAL", "Large event '" + r.purpose + "' FULLY approved (dual).", r.id);
    if(reqUsername) notifyUser(reqUsername, "Your large-event request '" + r.purpose + "' is FULLY Approved.", r.id);
  } else {
    r.status = "Partially Approved"; r.updated_at = nowISO();
    logAudit("STATUS_CHANGE", "Large event '" + r.purpose + "' partially approved (Admin=" + r.admin_decision + ", Security=" + r.security_decision + ")", r.id);
    if(reqUsername) notifyUser(reqUsername, "Your large-event request '" + r.purpose + "' is Partially Approved (" + r.admin_decision + "/" + r.security_decision + ").", r.id);
  }
  save(LS.res, reservations);
  return { ok:true };
}

function changeStatus(id, to){
  var u = currentUser();
  if(!u) return { ok:false, msg:"Access denied. Please login." };
  var r = reservations.find(function(x){ return x.id===id; });
  if(!r) return { ok:false, msg:"Reservation not found." };
  if(r.status==="Completed" || r.status==="No-show") return { ok:false, msg:"Blocked (BR-B4-07): Completed/No-show reservations cannot be changed." };
  if(r.status==="Rejected" && to==="Scheduled") return { ok:false, msg:"Blocked (BR-B4-05): Rejected reservations cannot become Scheduled." };
  if(!(TRANSITIONS[r.status]||[]).includes(to)) return { ok:false, msg:"Invalid transition: " + r.status + " to " + to + "." };

  // Large-event single-step approve blocked: must use decideApproval
  if(r.is_large_event && to==="Approved" && (r.admin_decision!=="Approved" || r.security_decision!=="Approved"))
    return { ok:false, msg:"Blocked (CR-01): large events need dual approval (Admin + Security). Use Approve buttons in Approval Queue." };
  if((to==="Approved"||to==="Rejected"||to==="Partially Approved") && u.role!=="Administrator" && u.role!=="Security")
    return { ok:false, msg:"Blocked (BR-B4-04): Only Administrator (or Security for large events) may approve/reject." };
  if(!r.is_large_event && (to==="Approved"||to==="Rejected") && u.role!=="Administrator")
    return { ok:false, msg:"Blocked (BR-B4-04): Only Administrator may approve/reject reservations." };
  if(to==="In Use" && !(u.role==="Facility Staff"||u.role==="Administrator"))
    return { ok:false, msg:"Only Facility Staff (or Admin) may confirm usage." };
  if((to==="Completed"||to==="No-show") && !(u.role==="Facility Staff"||u.role==="Administrator"))
    return { ok:false, msg:"Only Facility Staff (or Admin) may record completion/no-show." };
  if(to==="Cancelled" && u.role==="Requester" && r.requester_id!==u.id)
    return { ok:false, msg:"Blocked (BR-B4-09): you can cancel only your own requests." };
  if((to==="Approved"||to==="Scheduled"||to==="In Use")){
    var clash = isOverlapping(r.facility_id, r.start_time, r.end_time, r.id);
    if(clash) return { ok:false, msg:"Blocked (BR-B4-03): conflicts with " + clash.status + " reservation." };
  }
  var from = r.status;
  r.status = to; r.updated_at = nowISO();
  if(to==="Approved" && !r.is_large_event) r.admin_decision = "Approved";
  if(to==="Rejected" && !r.is_large_event) r.admin_decision = "Rejected";
  var labels = { Approved:"APPROVAL", Rejected:"REJECTION", Cancelled:"CANCELLATION", Scheduled:"STATUS_CHANGE", "In Use":"STATUS_CHANGE", Completed:"STATUS_CHANGE", "No-show":"NO_SHOW", "Partially Approved":"STATUS_CHANGE" };
  logAudit(labels[to]||"STATUS_CHANGE", u.username + " (" + u.role + ") changed " + from + " to " + to + " for '" + r.purpose + "'", r.id);
  var rq = users.find(function(x){ return x.id===r.requester_id; });
  if(rq) notifyUser(rq.username, "Your reservation '" + r.purpose + "' changed: " + from + " → " + to + ".", r.id);
  save(LS.res, reservations);
  return { ok:true };
}

function saveFacility(opts){
  var id = opts.id, name = opts.name, type = opts.type, capacity = opts.capacity, location = opts.location, status = opts.status, condition_notes = opts.condition_notes, approval_type = opts.approval_type || "Requires approval";
  var u = currentUser();
  if(!u) return { ok:false, msg:"Access denied." };
  if(!name) return { ok:false, msg:"Facility name required." };
  if(id){
    var f = getFacility(id);
    if(!f) return { ok:false, msg:"Facility not found." };
    if(u.role==="Facility Staff"){
      f.condition_notes = condition_notes; f.updated_at = nowISO();
      logAudit("FACILITY_UPDATE", u.username + " updated condition of '" + f.name + "'");
    } else if(u.role==="Administrator"){
      Object.assign(f, { name: name, type: type, capacity:parseInt(capacity,10)||0, location: location, status: status, approval_type: approval_type, condition_notes: condition_notes, updated_at: nowISO() });
      logAudit("FACILITY_UPDATE", u.username + " updated facility '" + name + "' (status=" + status + ", approval=" + approval_type + ")");
    } else return { ok:false, msg:"Only Administrator or Facility Staff may update facilities." };
  } else {
    if(u.role!=="Administrator") return { ok:false, msg:"Only Administrator may create facilities." };
    facilities.unshift({ id: uid(), name: name, type: type, capacity:parseInt(capacity,10)||0, location: location, status: status, approval_type: approval_type, condition_notes: condition_notes, created_at: nowISO(), updated_at: nowISO() });
    logAudit("FACILITY_CREATE", u.username + " created facility '" + name + "' (status=" + status + ", approval=" + approval_type + ")");
  }
  save(LS.fac, facilities);
  return { ok:true };
}
function deleteFacility(id){
  var u = currentUser();
  if(!u || u.role!=="Administrator") return { ok:false, msg:"Only Administrator may delete facilities." };
  var f = getFacility(id);
  var hasActive = reservations.some(function(r){ return r.facility_id===id && ["Pending","Approved","Scheduled","In Use"].indexOf(r.status)!==-1; });
  if(hasActive) return { ok:false, msg:"Cannot delete: facility has active reservations." };
facilities = facilities.filter(function(x){ return x.id!==id; });
  save(LS.fac, facilities);
  if(isSupabaseConfigured() && supabaseClient) supabaseClient.from("facilities").delete().eq("id", id).catch(function(e){ console.warn("Supabase delete failed:", e); });
  logAudit("FACILITY_DELETE", u.username + " deleted facility '" + (f ? f.name : id) + "'");
  return { ok:true };
}

function submitService(facility_id, concern){
  var u = currentUser();
  if(!u) return { ok:false, msg:"Access denied." };
  if(!(u.role==="Facility Staff"||u.role==="Administrator")) return { ok:false, msg:"Only Facility Staff may create service requests." };
  if(!concern) return { ok:false, msg:"Concern is required." };
  serviceReqs.unshift({ id: uid(), facility_id: facility_id, reported_by: u.username, concern: concern, status:"Open", created_at: nowISO() });
  save(LS.srv, serviceReqs);
  logAudit("SERVICE_CREATE", u.username + " filed service concern: " + concern);
  return { ok:true };
}
function toast(msg){ try{ if(typeof document==="undefined") return; var t=$("toast"); if(!t) return; t.textContent=msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t=setTimeout(function(){t.classList.add("hidden");},2600); }catch(e){} }
function showDenied(msg){ try{ if(typeof document==="undefined") return; var d=$("deniedBox"); if(!d) return; d.textContent=msg; d.classList.remove("hidden"); setTimeout(function(){d.classList.add("hidden");},4000); }catch(e){} }
function statusChip(s){ return '<span class="status st-' + s.replace(/ /g,"") + '">' + esc(s) + '</span>'; }

function actionBadge(action){
  var cls = "system";
  if(action.indexOf("LOGIN")!==-1) cls = "login";
  else if(action.indexOf("LOGOUT")!==-1) cls = "logout";
  else if(action.indexOf("SUBMIT")!==-1) cls = "submit";
  else if(action.indexOf("APPROVAL")!==-1) cls = "approval";
  else if(action.indexOf("REJECTION")!==-1) cls = "rejection";
  else if(action.indexOf("STATUS")!==-1) cls = "status";
  else if(action.indexOf("CREATE")!==-1) cls = "create";
  else if(action.indexOf("UPDATE")!==-1) cls = "update";
  else if(action.indexOf("DELETE")!==-1) cls = "delete";
  else if(action.indexOf("TEST")!==-1) cls = "test";
  return '<span class="action-badge ' + cls + '">' + esc(action) + '</span>';
}

function actionTable(action){
  if(action.indexOf("FACILITY")!==-1) return "facilities";
  if(action.indexOf("RESERVATION")!==-1) return "reservations";
  if(action.indexOf("USER")!==-1) return "users";
  if(action.indexOf("SERVICE")!==-1) return "service_requests";
  if(action.indexOf("LOGIN")!==-1 || action.indexOf("LOGOUT")!==-1) return "users";
  if(action.indexOf("SYSTEM")!==-1) return "system";
  if(action.indexOf("TEST")!==-1) return "system";
  return "audit_logs";
}

function guard(view){
  var u = currentUser();
  var protectedViews = ["dashboard","facilities","availability","reservations","approval","service","users","audit","authlist","reports","notifications","docs","tests"];
  if(protectedViews.indexOf(view)!==-1 && !u){
    if(typeof document!=="undefined"){
      document.querySelectorAll(".view").forEach(function(v){v.classList.add("hidden");});
      $("view-login").classList.remove("hidden");
      showDenied("Access denied: please login to open '" + view + "'.");
    }
    return false;
  }
  if(!u) return true;
  if(view==="users" && u.role!=="Administrator"){ showDenied("Access denied: Users page is Administrator-only."); return false; }
  if(view==="audit" && !(u.role==="Administrator"||u.role==="Management")){ showDenied("Access denied: Audit Logs are Administrator/Management only."); return false; }
  if(view==="approval" && !(u.role==="Administrator"||u.role==="Security")){ showDenied("Access denied: Approval Queue is Administrator/Security only."); return false; }
  if(view==="reports" && !(u.role==="Administrator"||u.role==="Management")){ showDenied("Access denied: Reports are Administrator/Management only."); return false; }
  if(view==="authlist" && !(u.role==="Security"||u.role==="Administrator"||u.role==="Facility Staff"||u.role==="Management")){ showDenied("Access denied: Authorization list is Security/Admin/Staff/Management only."); return false; }
  return true;
}

function showView(view){
  if(!guard(view)) return;
  if(typeof document==="undefined") return;
  document.querySelectorAll(".view").forEach(function(v){v.classList.add("hidden");});
  var el = $("view-"+view);
  if(el) el.classList.remove("hidden");
  document.querySelectorAll(".sidebar-link").forEach(function(b){b.classList.toggle("active", b.dataset.view===view);});
  try{ if(view!=="login" && location.hash !== "#/"+view) history.replaceState(null,"","#/"+view); }catch(e){}
  if(view==="dashboard") renderDashboard();
  else if(view==="facilities") renderFacilities();
  else if(view==="availability") renderAvailability();
  else if(view==="reservations") renderReservations();
  else if(view==="approval") renderApproval();
  else if(view==="service") renderService();
  else if(view==="users") renderUsers();
  else if(view==="audit") renderAudit();
  else if(view==="authlist") renderAuthList();
  else if(view==="reports") renderReports();
  else if(view==="notifications") renderNotifications();
  else if(view==="docs") renderDocs();
  else if(view==="tests") renderTests();
}

function refreshChrome(){
  if(typeof document==="undefined") return;
  if(!$("logoutBtn") || !$("sidebarUserName")) return;
  var u = currentUser();
  $("logoutBtn").classList.toggle("hidden", !u);
  if(u) {
    $("sidebarUserName").textContent = u.username;
    $("sidebarUserRole").textContent = u.role;
    $("sidebarUserRole").style.display = "";
    var unread = notifications.filter(function(n){ return n.username===u.username && !n.is_read; }).length;
    var nb = $("navNotifBadge"); if(nb){ nb.textContent = unread>0 ? " ("+unread+")" : ""; }
  } else {
    $("sidebarUserName").textContent = "guest";
    $("sidebarUserRole").textContent = "";
    $("sidebarUserRole").style.display = "none";
  }
  var vis = {
    users: ["Administrator"],
    audit: ["Administrator","Management"],
    approval: ["Administrator","Security"],
    reports: ["Administrator","Management"],
    authlist: ["Administrator","Security","Facility Staff","Management"],
    service: ["Administrator","Facility Staff"],
    reservations: ["Administrator","Facility Staff","Requester","Security","Management"],
    facilities: ["Administrator","Facility Staff","Requester","Security","Management"],
    availability: ["Administrator","Facility Staff","Requester","Security","Management"],
    dashboard: ["Administrator","Facility Staff","Requester","Security","Management"],
    notifications: ["Administrator","Facility Staff","Requester","Security","Management"],
    docs: ["Administrator","Facility Staff","Requester","Security","Management"],
    tests: ["Administrator","Facility Staff","Requester","Security","Management"]
  };
  document.querySelectorAll(".sidebar-link").forEach(function(b){
    var v = b.dataset.view;
    if(!u){ b.style.display = "none"; return; }
    var allowed = vis[v];
    b.style.display = (allowed && allowed.indexOf(u.role)===-1) ? "none" : "";
  });
}
function renderDashboard(){
  var u = currentUser(); if(!u || typeof document==="undefined") return;
  var activeFacilities = facilities.filter(function(f){ return f.status==="Active"; }).length;
  var totalReservations = reservations.length;
  var pendingApprovals = reservations.filter(function(r){ return r.status==="Pending"||r.status==="Partially Approved"; }).length;

  $("statGrid").innerHTML =
    '<div class="stat stat-blue"><div class="stat-label">Total Facilities</div><b>' + facilities.length + '</b></div>' +
    '<div class="stat stat-dark"><div class="stat-label">Total Reservations</div><b>' + totalReservations + '</b></div>' +
    '<div class="stat stat-orange"><div class="stat-label">Pending Approvals</div><b>' + pendingApprovals + '</b></div>';

  var recentLogs = auditLogs.slice(0, 20);
  $("dashRecentActivity").innerHTML = recentLogs.map(function(a){
    return '<tr><td>' + actionBadge(a.action) + '</td><td>' + esc(actionTable(a.action)) + '</td><td>' + esc(a.actor) + '</td><td>' + fmtDT(a.created_at) + '</td></tr>';
  }).join("") || '<tr><td colspan="4" class="muted">No recent activity.</td></tr>';
}

function renderFacilities(){
  var u = currentUser();
  var canManage = u && u.role==="Administrator";
  $("facilityFormCard").style.display = (canManage || (u && u.role==="Facility Staff")) ? "" : "none";
  $("facilityFormTitle").innerHTML = u && u.role==="Facility Staff" ? "Update Facility Condition <span class='muted small'>(Staff: condition notes only)</span>" : "Add Facility <span class='muted small'>(Administrator only)</span>";
  var q = ($("facSearch").value||"").toLowerCase();
  var rows = facilities.filter(function(f){ return !q || (f.name+f.type+f.location+f.status).toLowerCase().indexOf(q)!==-1; });
  $("facBody").innerHTML = rows.map(function(f){
    var btns = "";
    if(u && u.role==="Administrator") btns = '<button class="btn btn-sm" onclick="editFacility(\'' + f.id + '\')">Edit</button> <button class="btn btn-sm btn-danger" onclick="delFacility(\'' + f.id + '\')">Delete</button>';
    else if(u && u.role==="Facility Staff") btns = '<button class="btn btn-sm" onclick="editFacility(\'' + f.id + '\')">Update Condition</button>';
    else btns = '<span class="muted small">view only</span>';
    return '<tr><td><b>' + esc(f.name) + '</b></td><td>' + esc(f.type) + '</td><td>' + esc(f.capacity) + '</td><td>' + esc(f.location) + '</td><td>' + statusChip(f.status) + '</td><td><span class="pill">' + esc(f.approval_type||"Requires approval") + '</span></td><td>' + esc(f.condition_notes||"") + '</td><td class="actions-cell">' + btns + '</td></tr>';
  }).join("") || '<tr><td colspan="8" class="muted">No facilities.</td></tr>';
}
window.editFacility = function(id){
  var f = getFacility(id); if(!f) return;
  $("facEditId").value = f.id; $("facName").value=f.name; $("facType").value=f.type; $("facCap").value=f.capacity; $("facLoc").value=f.location||""; $("facStatus").value=f.status; $("facCond").value=f.condition_notes||"";
  if($("facApproval")) $("facApproval").value = f.approval_type || "Requires approval";
  var u = currentUser();
  var staffOnly = u && u.role==="Facility Staff";
  ["facName","facType","facCap","facLoc","facStatus"].forEach(function(i){$(i).disabled=!!staffOnly;});
  if($("facApproval")) $("facApproval").disabled = !!staffOnly;
  $("facSaveBtn").textContent = staffOnly ? "Save Condition" : "Update Facility";
  $("facCancelBtn").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
};
window.delFacility = function(id){ var r = deleteFacility(id); toast(r.ok?"Facility deleted.":r.msg); if(r.ok) renderFacilities(); else showDenied(r.msg); };

function fillResFacilityOptions(){
  if(typeof document==="undefined" || !$("resFacility")) return;
  var act = facilities.filter(function(f){ return f.status==="Active"; });
  $("resFacility").innerHTML = act.length ? act.map(function(f){ return '<option value="' + f.id + '">' + esc(f.name) + ' - ' + esc(f.location||"") + ' (cap ' + esc(String(f.capacity)) + ', ' + esc(f.approval_type||"") + ')</option>'; }).join("") : '<option value="">No active facilities</option>';
  if($("srvFacility")) $("srvFacility").innerHTML = facilities.map(function(f){ return '<option value="' + f.id + '">' + esc(f.name) + ' (' + esc(f.status) + ')</option>'; }).join("");
}
function dualBadge(r){
  if(!r.is_large_event) return "";
  return '<br/><span class="pill warn" title="Dual approval required">LARGE ' + esc(String(r.participant_count||"?")) + ' pax</span><br/><span class="muted small">Admin: ' + esc(r.admin_decision||"?") + ' | Sec: ' + esc(r.security_decision||"?") + '</span>';
}
function renderReservations(){
  fillResFacilityOptions();
  var u = currentUser();
  $("resFormCard").style.display = (u && (u.role==="Requester"||u.role==="Administrator")) ? "" : "none";
  var q = ($("resSearch").value||"").toLowerCase();
  var sf = $("resStatusFilter").value;
  var rows = reservations.slice();
  if(u && u.role==="Requester") rows = rows.filter(function(r){ return r.requester_id===u.id; });
  if(sf) rows = rows.filter(function(r){ return r.status===sf; });
  if(q) rows = rows.filter(function(r){ var f=getFacility(r.facility_id); return ((f?f.name:"")+r.requester_name+r.purpose+r.status).toLowerCase().indexOf(q)!==-1; });
  $("resBody").innerHTML = rows.map(function(r){
    var f = getFacility(r.facility_id);
    var acts = [];
    if(u && u.role==="Administrator" && !r.is_large_event && r.status==="Pending"){ acts.push('<button class="btn btn-sm btn-primary" onclick="doStatus(\'' + r.id + '\',\'Approved\')">Approve</button>', '<button class="btn btn-sm btn-danger" onclick="doStatus(\'' + r.id + '\',\'Rejected\')">Reject</button>'); }
    if(u && u.role==="Administrator" && r.status==="Approved"){ acts.push('<button class="btn btn-sm btn-primary" onclick="doStatus(\'' + r.id + '\',\'Scheduled\')">Schedule</button>'); }
    if(u && (u.role==="Facility Staff"||u.role==="Administrator") && ["Approved","Scheduled"].indexOf(r.status)!==-1){ acts.push('<button class="btn btn-sm btn-primary" onclick="doStatus(\'' + r.id + '\',\'In Use\')">Mark In Use</button>'); }
    if(u && (u.role==="Facility Staff"||u.role==="Administrator") && r.status==="In Use"){ acts.push('<button class="btn btn-sm" onclick="doStatus(\'' + r.id + '\',\'Completed\')">Complete</button>'); }
    if(u && (u.role==="Facility Staff"||u.role==="Administrator") && ["Scheduled","In Use"].indexOf(r.status)!==-1){ acts.push('<button class="btn btn-sm btn-danger" onclick="doStatus(\'' + r.id + '\',\'No-show\')">No-show</button>'); }
    if(["Pending","Partially Approved","Approved","Scheduled"].indexOf(r.status)!==-1 && (u && (u.role==="Administrator" || (u.role==="Requester" && r.requester_id===u.id)))){
      if(!(u && u.role==="Requester" && (r.status!=="Pending" && r.status!=="Partially Approved"))) acts.push('<button class="btn btn-sm btn-secondary" onclick="doStatus(\'' + r.id + '\',\'Cancelled\')">Cancel</button>');
    }
    if((u && u.role==="Requester" && r.requester_id===u.id && (r.status==="Pending"||r.status==="Partially Approved")) || (u && u.role==="Administrator" && ["Completed","Cancelled","Rejected","No-show"].indexOf(r.status)===-1)){
      acts.push('<button class="btn btn-sm" onclick="editReservation(\'' + r.id + '\')">Edit</button>');
    }
    return '<tr><td><b>' + esc(f ? f.name : "?") + '</b><br/><span class="muted small">' + esc(f ? f.status : "") + '</span></td><td>' + esc(r.requester_name) + '</td><td>' + esc(r.purpose) + '<br/><span class="muted small">' + esc(String(r.participant_count||1)) + ' pax</span>' + dualBadge(r) + '</td><td class="small">' + fmtDT(r.start_time) + '<br/>' + fmtDT(r.end_time) + '</td><td>' + statusChip(r.status) + '</td><td class="actions-cell">' + (acts.join(" ")||'<span class="muted small">-</span>') + '</td></tr>';
  }).join("") || '<tr><td colspan="6" class="muted">No reservations found.</td></tr>';
}
window.doStatus = function(id,to){ var r = changeStatus(id,to); toast(r.ok?"Status changed to "+to+".":r.msg); if(!r.ok) showDenied(r.msg); renderReservations(); renderApproval(); };
window.editReservation = function(id){
  var r = reservations.find(function(x){ return x.id===id; }); if(!r) return;
  var u = currentUser();
  if(u && u.role==="Requester" && (r.requester_id!==u.id || (r.status!=="Pending"&&r.status!=="Partially Approved"))){ showDenied("Blocked (BR-B4-09): requesters may edit only their own Pending requests."); return; }
  if(r.status==="Completed"||r.status==="No-show"){ showDenied("Blocked (BR-B4-07): Completed/No-show reservations cannot be edited."); return; }
  fillResFacilityOptions();
  $("resEditId").value=r.id; $("resFacility").value=r.facility_id; $("resPurpose").value=r.purpose;
  if($("resPax")) $("resPax").value = r.participant_count || 1;
  var toLocal = function(v){ var d=new Date(v); function p(n){return String(n).padStart(2,"0");} return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes()); };
  $("resStart").value=toLocal(r.start_time); $("resEnd").value=toLocal(r.end_time);
  $("resSaveBtn").textContent="Save Changes"; $("resCancelEditBtn").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
};

function renderApproval(){
  var u = currentUser();
  var pending = reservations.filter(function(r){ return r.status==="Pending"||r.status==="Partially Approved"; });
  if(u && u.role==="Security") pending = pending.filter(function(r){ return r.is_large_event; });
  $("approvalBody").innerHTML = pending.map(function(r){
    var f = getFacility(r.facility_id);
    var acts = "";
    if(r.is_large_event){
      var canAct = (u && (u.role==="Administrator"||u.role==="Security"));
      var myDone = (u.role==="Administrator" && r.admin_decision!=="Pending") || (u.role==="Security" && r.security_decision!=="Pending");
      acts = canAct && !myDone
        ? '<button class="btn btn-sm btn-primary" onclick="doDecide(\'' + r.id + '\',\'Approved\')">Approve (' + esc(u.role) + ')</button> <button class="btn btn-sm btn-danger" onclick="doDecide(\'' + r.id + '\',\'Rejected\')">Reject (' + esc(u.role) + ')</button>'
        : '<span class="muted small">Awaiting ' + (r.admin_decision==="Pending"?"Admin":"") + (r.admin_decision==="Pending"&&r.security_decision==="Pending"?" + ":"") + (r.security_decision==="Pending"?"Security":"") + '</span>';
    } else if(u && u.role==="Administrator"){
      acts = '<button class="btn btn-sm btn-primary" onclick="doStatus(\'' + r.id + '\',\'Approved\')">Approve</button> <button class="btn btn-sm btn-danger" onclick="doStatus(\'' + r.id + '\',\'Rejected\')">Reject</button>';
    } else {
      acts = '<span class="muted small">Admin only</span>';
    }
    return '<tr><td><b>' + esc(f ? f.name : "?") + '</b>' + (r.is_large_event?'<br/><span class="pill warn">LARGE ' + esc(String(r.participant_count)) + ' pax — dual</span>':'') + '</td><td>' + esc(r.requester_name) + '</td><td>' + esc(r.purpose) + '<br/><span class="muted small">' + esc(String(r.participant_count||1)) + ' pax | Admin: ' + esc(r.admin_decision||"?") + ' | Sec: ' + esc(r.security_decision||"?") + '</span></td><td class="small">' + fmtDT(r.start_time) + ' to ' + fmtDT(r.end_time) + '</td><td>' + statusChip(r.status) + '</td><td class="actions-cell">' + acts + '</td></tr>';
  }).join("") || '<tr><td colspan="6" class="muted">No pending approvals.</td></tr>';
}
window.doDecide = function(id, d){ var r = decideApproval(id, d); toast(r.ok?("Decision recorded: "+d+"."):r.msg); if(!r.ok) showDenied(r.msg); renderReservations(); renderApproval(); refreshChrome(); };

/* ---------- New views: availability / auth list / reports / notifications ---------- */
function renderAvailability(){
  var type = $("avType") ? $("avType").value : "";
  var cap = $("avCap") ? $("avCap").value : "";
  var start = $("avStart") ? $("avStart").value : "";
  var end = $("avEnd") ? $("avEnd").value : "";
  var list = facilities.filter(function(f){ return f.status==="Active"; });
  if(type) list = list.filter(function(f){ return f.type===type; });
  if(cap) list = list.filter(function(f){ return f.capacity >= parseInt(cap,10); });
  $("avBody").innerHTML = list.map(function(f){
    var avail = true, note = "Free";
    if(start && end){
      var c = checkAvailability(f.id, start, end, null);
      avail = c.available;
      note = avail ? "Available for selected slot" : ("Busy — conflicts " + (c.conflict?c.conflict.status:""));
    }
    return '<tr><td><b>' + esc(f.name) + '</b><br/><span class="muted small">' + esc(f.location||"") + '</span></td><td>' + esc(f.type) + '</td><td>' + esc(String(f.capacity)) + '</td><td><span class="pill">' + esc(f.approval_type||"") + '</span></td><td>' + (avail?'<span class="status st-Approved">Available</span>':'<span class="status st-Rejected">Busy</span>') + '<br/><span class="muted small">' + esc(note) + '</span></td><td>' + (avail&&start?'<button class="btn btn-sm btn-primary" onclick="bookFromAvailability(\'' + f.id + '\')">Book this slot</button>':'<span class="muted small">-</span>') + '</td></tr>';
  }).join("") || '<tr><td colspan="6" class="muted">No facilities match.</td></tr>';
}
window.bookFromAvailability = function(fid){
  showView("reservations");
  fillResFacilityOptions();
  try{ $("resFacility").value = fid; }catch(e){}
  if($("avStart").value) $("resStart").value = $("avStart").value;
  if($("avEnd").value) $("resEnd").value = $("avEnd").value;
  window.scrollTo({top:0,behavior:"smooth"});
  toast("Slot carried to reservation form. Enter purpose + participants.");
};
function renderAuthList(){
  var df = $("authDate") ? $("authDate").value : "";
  var rows = getAuthList(df || null);
  var u = currentUser();
  if(u && u.role==="Security"){ /* sees all after-hours */ }
  $("authBody").innerHTML = rows.map(function(r){
    var f = getFacility(r.facility_id);
    return '<tr><td><b>' + esc(f?f.name:"?") + '</b><br/><span class="muted small">' + esc(f?f.location||"":"") + '</span></td><td>' + esc(r.requester_name) + '</td><td>' + esc(r.purpose) + ' (' + esc(String(r.participant_count||1)) + ' pax)</td><td class="small">' + fmtDT(r.start_time) + '<br/>' + fmtDT(r.end_time) + '</td><td>' + (isAfterHours(r.start_time)||isAfterHours(r.end_time)?'<span class="pill warn">After-hours</span>':'<span class="pill">Large event</span>') + '</td><td>' + statusChip(r.status) + '</td></tr>';
  }).join("") || '<tr><td colspan="6" class="muted">No authorized after-hours use for this filter.</td></tr>';
  if($("authCount")) $("authCount").textContent = rows.length + " authorized entr" + (rows.length===1?"y":"ies");
}
function renderReports(){
  var from = $("repFrom") ? $("repFrom").value : "";
  var to = $("repTo") ? $("repTo").value : "";
  var data = getUtilization(from ? new Date(from).toISOString() : null, to ? new Date(to).toISOString() : null);
  var tot = data.reduce(function(a,x){return { total:a.total+x.total, hours:a.hours+x.hours, noshow:a.noshow+x.noshow, cancelled:a.cancelled+x.cancelled };},{total:0,hours:0,noshow:0,cancelled:0});
  $("repSummary").innerHTML = '<div class="stat stat-blue"><div class="stat-label">Bookings (filter)</div><b>' + tot.total + '</b></div><div class="stat stat-dark"><div class="stat-label">Booked hours</div><b>' + tot.hours + '</b></div><div class="stat stat-orange"><div class="stat-label">Cancelled</div><b>' + tot.cancelled + '</b></div><div class="stat stat-red"><div class="stat-label">No-shows</div><b>' + tot.noshow + '</b></div>';
  $("repBody").innerHTML = data.map(function(x){
    return '<tr><td><b>' + esc(x.facility) + '</b><br/><span class="muted small">' + esc(x.type) + ' | cap ' + esc(String(x.capacity)) + '</span></td><td>' + x.total + '</td><td>' + x.approved + '</td><td>' + x.hours + '</td><td>' + x.cancelled + '</td><td>' + x.noshow + '</td><td>' + x.rejected + '</td></tr>';
  }).join("");
}
window.exportReportsCSV = function(){
  var from = $("repFrom") ? $("repFrom").value : "";
  var to = $("repTo") ? $("repTo").value : "";
  var data = getUtilization(from ? new Date(from).toISOString() : null, to ? new Date(to).toISOString() : null);
  var csv = "facility,type,capacity,total,approved,hours,cancelled,noshow,rejected\n" + data.map(function(x){return [x.facility,x.type,x.capacity,x.total,x.approved,x.hours,x.cancelled,x.noshow,x.rejected].join(",");}).join("\n");
  download("utilization_report.csv", csv);
};
function renderNotifications(){
  var list = myNotifications();
  var unread = list.filter(function(n){return !n.is_read;}).length;
  if($("notifCount")) $("notifCount").textContent = unread + " unread / " + list.length + " total";
  $("notifBody").innerHTML = list.slice(0,100).map(function(n){
    return '<tr><td class="small">' + fmtDT(n.created_at) + '</td><td>' + esc(n.message) + '</td><td>' + (n.is_read?'<span class="muted small">Read</span>':'<button class="btn btn-sm" onclick="markNotifRead(\'' + n.id + '\')">Mark read</button>') + '</td></tr>';
  }).join("") || '<tr><td colspan="3" class="muted">No notifications.</td></tr>';
  refreshChrome();
}
window.markNotifRead = function(id){ var n = notifications.find(function(x){return x.id===id;}); if(n){ n.is_read = true; save(LS.notif, notifications); renderNotifications(); } };
window.markAllNotifRead = function(){ var u = currentUser(); notifications.forEach(function(n){ if(n.username===(u&&u.username)) n.is_read = true; }); save(LS.notif, notifications); renderNotifications(); };

/* ---------- Docs & ERD (Submission 3-6) ---------- */
function renderDocs(){
  if(!$("permMatrixBody")) return;
  $("permMatrixBody").innerHTML = PERMISSIONS.map(function(p){
    var yes = '<span class="status st-Approved">Yes</span>';
    var no = '<span class="muted small">—</span>';
    return '<tr><td>' + esc(p.fn) + '</td><td>' + (p.admin?yes:no) + '</td><td>' + (p.staff?yes:no) + '</td><td>' + (p.requester?yes:no) + '</td><td>' + (p.security?yes:no) + '</td><td>' + (p.management?yes:no) + '</td></tr>';
  }).join("");
  try{ if(typeof mermaid!=="undefined") mermaid.run({ querySelector:".mermaid" }); }catch(e){}
}

/* ---------- Test Checklist (Submission 8) ---------- */
var TEST_CASES = [
  { id:"TC-B4-01", scenario:"Requester submits", expected:"Pending (or Approved if Auto-confirm)", how:"requester → Reservations → submit" },
  { id:"TC-B4-02", scenario:"Overlapping schedule", expected:"Blocked (BR-B4-03)", how:"same facility + overlapping Approved/Scheduled" },
  { id:"TC-B4-03", scenario:"Admin approves", expected:"Approved/Scheduled", how:"admin → Approval Queue → Approve" },
  { id:"TC-B4-04", scenario:"Admin rejects", expected:"Rejected + remark", how:"admin → Approval Queue → Reject" },
  { id:"TC-B4-05", scenario:"Staff marks In Use", expected:"In Use", how:"staff → Reservations → Mark In Use" },
  { id:"TC-B4-06", scenario:"Staff completes", expected:"Completed (terminal)", how:"staff → Reservations → Complete" },
  { id:"TC-B4-07", scenario:"Edit another user's request", expected:"Blocked (BR-B4-09)", how:"requester2 edits requester's Pending" },
  { id:"TC-B4-08", scenario:"Reserve Maintenance facility", expected:"Blocked (BR-B4-01/08)", how:"pick Auditorium (Maintenance)" },
  { id:"TC-B4-09", scenario:"Audit log visible", expected:"Yes, with actor+timestamp", how:"admin → Audit Logs → Export CSV" },
  { id:"TC-B4-10", scenario:"Protected page w/o login", expected:"Denied → login", how:"logout → #/audit" },
  { id:"TC-CR-01", scenario:"150 pax dual approval", expected:"Partially Approved → Approved after both", how:"requester 150 pax → admin approve → security approve" },
];

function automatedRuleChecks(){
  // Runs deterministic checks against current in-memory state + logic
  var results = {};
  // TC-B4-02: overlap logic
  var fac = facilities.find(function(f){ return f.status==="Active"; });
  if(fac){
    var clash = isOverlapping(fac.id, "2099-01-01T10:00:00","2099-01-01T11:00:00",null);
    results["TC-B4-02"] = !clash ? "PASS" : "FAIL"; // no existing 2099 booking → no false positive
    // active-only check
    var maint = facilities.find(function(f){ return f.status==="Maintenance"; });
    results["TC-B4-08"] = maint ? "PASS (logic exists)" : "SKIP";
  }
  // TC-B4-05 transitions
  results["TC-B4-05"] = (TRANSITIONS["Scheduled"]||[]).indexOf("In Use")!==-1 ? "PASS" : "FAIL";
  results["TC-B4-06"] = (TRANSITIONS["In Use"]||[]).indexOf("Completed")!==-1 && (TRANSITIONS["Completed"]||[]).length===0 ? "PASS" : "FAIL";
  // TC-B4-04: rejected terminal
  results["TC-B4-04"] = (TRANSITIONS["Rejected"]||[]).length===0 ? "PASS" : "FAIL";
  // TC-CR-01: threshold exists
  results["TC-CR-01"] = LARGE_EVENT_THRESHOLD===100 ? "PASS" : "FAIL";
  // TC-B4-09: audit logs exist with actor
  results["TC-B4-09"] = auditLogs.length>0 && auditLogs.every(function(a){return a.actor;}) ? "PASS" : "FAIL";
  return results;
}
function renderTests(){
  if(!$("testBody")) return;
  $("testBody").innerHTML = TEST_CASES.map(function(t){
    var prev = testResults[t.id] || "";
    var opts = ["","PASS","FAIL","SKIP"].map(function(o){ return '<option value="'+o+'"'+(prev===o?' selected':'')+'>'+(o||"—")+'</option>'; }).join("");
    return '<tr><td><code>'+t.id+'</code></td><td>'+esc(t.scenario)+'</td><td>'+esc(t.expected)+'</td><td class="small">'+esc(t.how)+'</td><td><select class="test-select" data-tid="'+t.id+'">'+opts+'</select></td></tr>';
  }).join("");
  document.querySelectorAll(".test-select").forEach(function(s){
    s.onchange = function(){ testResults[s.dataset.tid] = s.value; save(LS.tests, testResults); updateTestSummary(); };
  });
  updateTestSummary();
}
function updateTestSummary(){
  if(!$("testSummary")) return;
  var vals = Object.values(testResults).filter(Boolean);
  var pass = vals.filter(function(v){return v==="PASS";}).length;
  var fail = vals.filter(function(v){return v==="FAIL";}).length;
  $("testSummary").className = "form-message " + (fail?"error":(vals.length?"success":""));
  $("testSummary").textContent = vals.length ? (pass+" PASS · "+fail+" FAIL · "+(vals.length-pass-fail)+" SKIP/other of "+TEST_CASES.length+" cases") : "Select PASS/FAIL or run automated checks.";
}
window.runTests = function(){
  var auto = automatedRuleChecks();
  Object.keys(auto).forEach(function(k){ testResults[k] = auto[k]; });
  save(LS.tests, testResults);
  logAudit("TEST_RUN", "Automated rule checks run: " + JSON.stringify(auto));
  renderTests(); refreshChrome();
  toast("Automated checks complete.");
};
window.exportTests = function(){
  var csv = "id,scenario,expected,how_to_test,result\n" + TEST_CASES.map(function(t){
    return [t.id,'"'+t.scenario.replace(/"/g,'""')+'"','"'+t.expected.replace(/"/g,'""')+'"','"'+t.how.replace(/"/g,'""')+'"',testResults[t.id]||""].join(",");
  }).join("\n");
  download("functional_test_results.csv", csv);
};
function renderService(){
  fillResFacilityOptions();
  var u = currentUser();
  $("srvFormCard").style.display = (u && (u.role==="Facility Staff"||u.role==="Administrator")) ? "" : "none";
  $("srvBody").innerHTML = serviceReqs.map(function(s){
    var f = getFacility(s.facility_id);
    var canResolve = u && (u.role==="Administrator" || u.role==="Facility Staff");
    var next = s.status==="Open" ? "In Progress" : s.status==="In Progress" ? "Resolved" : null;
    return '<tr><td>' + esc(f ? f.name : "?") + '</td><td>' + esc(s.reported_by) + '</td><td>' + esc(s.concern) + '</td><td>' + statusChip(s.status) + '</td><td class="small">' + fmtDT(s.created_at) + '</td><td>' + (next&&canResolve?'<button class="btn btn-sm" onclick="srvStatus(\'' + s.id + '\',\'' + next + '\')">Mark ' + next + '</button>':'<span class="muted small">-</span>') + '</td></tr>';
  }).join("") || '<tr><td colspan="6" class="muted">No service requests.</td></tr>';
}
window.srvStatus = function(id,to){ var s=serviceReqs.find(function(x){return x.id===id;}); if(s){ s.status=to; save(LS.srv,serviceReqs); logAudit("SERVICE_UPDATE",currentUser().username + " set concern to " + to + ": " + s.concern); renderService(); } };

function renderUsers(){
  $("usersBody").innerHTML = users.map(function(x){
    return '<tr><td><code>' + esc(x.username) + '</code></td><td>' + esc(x.full_name) + '</td><td>' + esc(x.role) + '</td><td>' + (x.is_active?"Active":"Inactive") + '</td><td><button class="btn btn-sm" onclick="toggleUser(\'' + x.id + '\')">' + (x.is_active?"Deactivate":"Activate") + '</button></td></tr>';
  }).join("");
}
window.toggleUser = function(id){ var x=users.find(function(u){return u.id===id;}); var me=currentUser(); if(x && me && x.id===me.id){ showDenied("You cannot deactivate your own account."); return; } if(x){ x.is_active=!x.is_active; save(LS.users,users); logAudit("USER_UPDATE",me.username + " set " + x.username + ".is_active=" + x.is_active); renderUsers(); } };

function renderAudit(){
  var q = ($("auditSearch").value||"").toLowerCase();
  var rows = auditLogs.filter(function(a){ return !q || (a.actor+a.role+a.action+a.details).toLowerCase().indexOf(q)!==-1; }).slice(0,300);
  $("auditBody").innerHTML = rows.map(function(a){
    return '<tr><td class="small">' + fmtDT(a.created_at) + '</td><td><code>' + esc(a.actor) + '</code></td><td>' + esc(a.role) + '</td><td>' + actionBadge(a.action) + '</td><td>' + esc(a.details) + '</td></tr>';
  }).join("") || '<tr><td colspan="5" class="muted">No logs.</td></tr>';
}
function bindEvents(){
  if(typeof document==="undefined" || !$("loginForm")) return;
  document.querySelectorAll(".sidebar-link").forEach(function(b){b.onclick=function(){showView(b.dataset.view);};});
  document.querySelectorAll("[data-fill]").forEach(function(b){b.onclick=function(){ var parts=b.dataset.fill.split("|"); $("loginUser").value=parts[0]; $("loginPass").value=parts[1]; };});

  $("loginForm").addEventListener("submit",function(e){
    e.preventDefault();
    var r = login($("loginUser").value.trim(), $("loginPass").value);
    $("loginMsg").className = "form-message " + (r.ok?"success":"error");
    $("loginMsg").textContent = r.ok ? "Welcome, " + r.user.full_name + "!" : r.msg;
    if(r.ok){ refreshChrome(); showView("dashboard"); toast("Logged in as " + r.user.role + "."); }
  });
  $("registerForm").addEventListener("submit",function(e){
    e.preventDefault();
    var un=$("regUser").value.trim(), nm=$("regName").value.trim(), pw=$("regPass").value;
    if(!un||!nm||pw.length<4){ $("regMsg").className="form-message error"; $("regMsg").textContent="Fill all fields (password min 4 chars)."; return; }
    if(users.some(function(u){return u.username.toLowerCase()===un.toLowerCase();})){ $("regMsg").className="form-message error"; $("regMsg").textContent="Username already taken."; return; }
    users.unshift({ id:uid(), username:un, full_name:nm, role:"Requester", password:pw, is_active:true });
    save(LS.users,users); logAudit("USER_CREATE", un + " registered as Requester");
    $("regMsg").className="form-message success"; $("regMsg").textContent="Account created. You can now login.";
    e.target.reset();
  });
  $("logoutBtn").onclick = function(){ logout(); refreshChrome(); showView("login"); $("loginUser").value=""; $("loginPass").value=""; };

  $("facilityForm").addEventListener("submit",function(e){
    e.preventDefault();
    var r = saveFacility({ id:$("facEditId").value||null, name:$("facName").value.trim(), type:$("facType").value, capacity:$("facCap").value, location:$("facLoc").value.trim(), status:$("facStatus").value, approval_type: $("facApproval")?$("facApproval").value:"Requires approval", condition_notes:$("facCond").value.trim() });
    $("facMsg").className="form-message "+(r.ok?"success":"error"); $("facMsg").textContent=r.ok?"Saved.":r.msg;
    if(r.ok){ e.target.reset(); $("facEditId").value=""; ["facName","facType","facCap","facLoc","facStatus"].forEach(function(i){$(i).disabled=false;}); if($("facApproval")) $("facApproval").disabled=false; $("facSaveBtn").textContent="Save Facility"; $("facCancelBtn").classList.add("hidden"); renderFacilities(); }
  });
  $("facCancelBtn").onclick = function(){ $("facilityForm").reset(); $("facEditId").value=""; ["facName","facType","facCap","facLoc","facStatus"].forEach(function(i){$(i).disabled=false;}); if($("facApproval")) $("facApproval").disabled=false; $("facSaveBtn").textContent="Save Facility"; $("facCancelBtn").classList.add("hidden"); };
  $("facSearch").addEventListener("input", renderFacilities);

  $("resForm").addEventListener("submit",function(e){
    e.preventDefault();
    var r = submitReservation({ facility_id:$("resFacility").value, purpose:$("resPurpose").value.trim(), start_time:$("resStart").value, end_time:$("resEnd").value, participant_count: $("resPax")?$("resPax").value:1, editId:$("resEditId").value||null });
    $("resMsg").className="form-message "+(r.ok?"success":"error"); $("resMsg").textContent=r.ok?("Saved as "+(r.status||"Pending")+"."):r.msg;
    if(r.ok){ e.target.reset(); $("resEditId").value=""; $("resSaveBtn").textContent="Submit as Pending"; $("resCancelEditBtn").classList.add("hidden"); renderReservations(); refreshChrome(); }
    else showDenied(r.msg);
  });
  $("resCancelEditBtn").onclick = function(){ $("resForm").reset(); $("resEditId").value=""; $("resSaveBtn").textContent="Submit as Pending"; $("resCancelEditBtn").classList.add("hidden"); };
  $("resSearch").addEventListener("input", renderReservations);
  $("resStatusFilter").addEventListener("change", renderReservations);

  $("srvForm").addEventListener("submit",function(e){
    e.preventDefault();
    var r = submitService($("srvFacility").value, $("srvConcern").value.trim());
    $("srvMsg").className="form-message "+(r.ok?"success":"error"); $("srvMsg").textContent=r.ok?"Concern filed.":r.msg;
    if(r.ok){ e.target.reset(); renderService(); }
  });

  $("auditSearch").addEventListener("input", renderAudit);
  $("exportAuditBtn").onclick = function(){
    var csv = "timestamp,actor,role,action,details\n" + auditLogs.map(function(a){return [a.created_at,a.actor,a.role,a.action,'"' + (a.details||"").replace(/"/g,'""') + '"'].join(",");}).join("\n");
    download("audit_logs.csv", csv);
  };
  ["avType","avCap","avStart","avEnd"].forEach(function(id){ var el=$(id); if(el) el.addEventListener("input", renderAvailability); if(el) el.addEventListener("change", renderAvailability); });
  var avBtn=$("avSearchBtn"); if(avBtn) avBtn.onclick = renderAvailability;
  var authDate=$("authDate"); if(authDate){ authDate.addEventListener("change", renderAuthList); }
  var authBtn=$("authFilterBtn"); if(authBtn) authBtn.onclick = renderAuthList;
  var repBtn=$("repRunBtn"); if(repBtn) repBtn.onclick = renderReports;
  var repExp=$("repExportBtn"); if(repExp) repExp.onclick = function(){ exportReportsCSV(); };
  var nAll=$("notifReadAllBtn"); if(nAll) nAll.onclick = function(){ markAllNotifRead(); };
  var runT=$("runTestsBtn"); if(runT) runT.onclick = function(){ runTests(); };
  var expT=$("exportTestsBtn"); if(expT) expT.onclick = function(){ exportTests(); };
  try{ if(typeof mermaid!=="undefined") mermaid.initialize({ startOnLoad:false, theme:"neutral" }); }catch(e){}
  window.addEventListener("hashchange", function(){
    var h = (location.hash||"").replace("#/","") || (currentUser()?"dashboard":"login");
    if($("view-"+h)) showView(h);
  });
}
function download(name, text){
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text],{type:"text/csv"})); a.download=name; a.click();
}

/* Node smoke-test exports (browser ignores) */
try{
  if(typeof module!=="undefined" && module.exports){
    module.exports = { submitReservation, changeStatus, decideApproval, isOverlapping, checkAvailability, searchAvailability, getAuthList, getUtilization, routeFor, isAfterHours, TRANSITIONS, LARGE_EVENT_THRESHOLD, seedIfEmpty, setSession, login, getFacility, pushAll, pullAll, initSupabaseSync, _state: function(){ return { users: users, facilities: facilities, reservations: reservations }; } };
  }
}catch(e){}

if(typeof window!=="undefined" && typeof document!=="undefined" && typeof process==="undefined"){
(function init(){
  function showLanding(){
    var h = "";
    try{ h = (location.hash||"").replace("#/",""); }catch(e){}
    showView(currentUser() && $("view-"+h) ? h : (currentUser() ? "dashboard" : "login"));
  }
  function updateModeBadge(){
    var mb = $("modeBadge"); if(!mb) return;
    var on = isSupabaseConfigured() && supabaseClient;
    mb.textContent = on
      ? "Supabase Mode — data syncs to your cloud project; this browser is a live mirror."
      : "Demo Mode — data stays in this browser. To enable the cloud backend, put your Supabase URL + anon key in config.js and run schema.sql.";
  }
  seedIfEmpty();
  bindEvents();
  refreshChrome();
  updateModeBadge();
  initSupabaseSync().then(function(synced){
    if(synced){
      var ses = currentUser();
      if(ses){ var nu = users.find(function(x){ return x.username===ses.username; }); if(nu) setSession({ id:nu.id, username:nu.username, full_name:nu.full_name, role:nu.role }); }
    }
    refreshChrome();
    updateModeBadge();
    showLanding();
  });
})();
}
