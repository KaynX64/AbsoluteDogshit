import assert from 'node:assert/strict';
import { verifyQualificationStability } from './qualification-stability.mjs';

// Isolated renderer fixtures; never connects to a clinic account or database.
export async function verifyResponderQualifications(run,wait,resize,screenshot,setReducedMotion) {
 await run(`(() => {
  const previous=window.fetch;
  const at='2026-11-24T08:00:00Z',expires='2027-11-24T08:00:00Z';
  const make=(id,user,name,status)=>({application_id:id,user_id:user,applicant_name:name,status,source:'self',application_type:'initial',revision:1,requested_level:'community',created_at:at,form:{affiliation:'Synthetic PSU campus',trainingHistory:'Synthetic demo data: requesting campus assessment'},assessment:null,responsibilities_accepted_at:at,fixture_key:'synthetic-demo',evidence:[],events:[{event_id:id*10,action:'created',actor_name:name,created_at:at,details:{reason:'Synthetic application record for UI verification',requestedLevel:'community'}}]});
  smoke.qualification={actor:{userId:1,admin:true,reviewer:false},calls:[],ownRows:[make(103,1,'Fixture Staff','draft'),make(100,1,'Fixture Staff','approved')],rows:[make(102,12,'Rachelle Demo','submitted'),make(101,5,'Daniella Demo','approved')]};
  const state=smoke.qualification;
  state.rows[1].appointment={appointment_id:301,status:'active',level:'community',expires_at:expires};
  state.rows[1].events[0].details={synthetic:true,form:state.rows[1].form,assessment:null,reason:'Synthetic application record for UI verification'};
  state.rows[1].events.push({event_id:1011,action:'approve',actor_name:'Synthetic Clinic Reviewer',created_at:at,details:{synthetic:true,
    assessment:{identityVerified:true,affiliationVerified:true,professionalCredentialsVerified:false,
      competencies:{firstAid:true,basicLifeSupport:true,privacy:true},assessor:'Synthetic Clinic Reviewer',assessmentDate:'2026-11-24',result:'passed'},reason:'Synthetic assessment completed.'}});
  window.fetch=async(input,options={})=>{
   const path=new URL(input.url||input,location.href).pathname;
   if(!path.includes('/responder-qualifications/'))return previous(input,options);
   const method=options.method||'GET';state.calls.push({path,method,body:options.body});
   if(path.endsWith('/me')){
    if(state.holdMe)await new Promise(resolve=>{state.releaseMe=()=>{state.holdMe=false;state.releaseMe=null;resolve();};});
    if(state.denyMe)return Response.json({error:'Qualification access removed'},{status:403});
    if(state.failMe)return Response.json({error:'Synthetic refresh unavailable'},{status:503});
    return Response.json({actor:state.actor,enforced:true,applications:state.ownRows.filter(row=>row.user_id===state.actor.userId),appointments:[],notices:[],access:{authorized:false}});
   }
   if(path.endsWith('/reviewers'))return Response.json([{user_id:2,name:'Synthetic Clinic Reviewer',is_active:1}]);
   if(path.endsWith('/applications'))return Response.json({applications:state.rows.map(r=>({...r,appointment_id:r.appointment?.appointment_id,appointment_status:r.appointment?.status,expires_at:r.appointment?.expires_at})),nextCursor:null});
   const appointment=path.includes('/appointments/') && path.endsWith('/end');
   if(appointment){state.rows[1].appointment.status=JSON.parse(options.body).status;return Response.json({ok:true});}
   const applicationId=Number(path.split('/').at(-1));if(applicationId){
    const row=[...state.rows,...state.ownRows].find(r=>r.application_id===applicationId);
    if(state.holdDetail===applicationId)await new Promise(resolve=>{state.releaseDetail=()=>{state.holdDetail=null;state.releaseDetail=null;resolve();};});
    if(method==='PATCH'){
     const body=JSON.parse(options.body);if(state.failSave)return Response.json({error:'Synthetic save failure'},{status:503});if(body.revision!==row.revision)return Response.json({error:'Revision conflict'},{status:409});
     if(body.action==='save'){row.form={affiliation:body.affiliation,trainingHistory:body.trainingHistory};row.requested_level=body.requestedLevel;}
     if(body.action==='start_review')row.status='under_review';
     if(body.action==='save_assessment'){row.status='under_review';row.assessment=body.assessment;}
     if(body.action==='approve'){row.status='approved';row.assessment=body.assessment;row.appointment={appointment_id:302,status:'active',level:'community',expires_at:expires};}
     row.revision++;return Response.json({applicationId:row.application_id,userId:row.user_id});
    }return Response.json(row);
   }return Response.json([]);
  };
  smoke.click('Responder qualifications','.sb-item');
 })()`);
 await wait("document.querySelector('.qualification-workspace')?.textContent.includes('Applications and oversight')");
 await run("smoke.click('Applications and oversight','.qualification-toolbar button')");
 await wait("document.querySelector('.qualification-list')?.textContent.includes('Daniella Demo')");
 await run("smoke.click('Daniella Demo','.qualification-list button')");
 await wait("document.querySelector('.qualification-detail')?.textContent.includes('Appointment: active')");
 assert.equal(await run("[...document.querySelectorAll('.qualification-detail button')].some(b=>b.textContent==='Approve appointment')"),false,'Administrator oversight does not expose clinic approval');
 await run("smoke.fill([...document.querySelectorAll('.qualification-detail label')].find(l=>l.textContent.startsWith('Suspension or revocation reason')).querySelector('textarea'),'Synthetic demo revocation')");
 await run("document.querySelector('.qualification-appointment-controls').scrollIntoView({block:'center'});document.querySelector('.qualification-appointment-controls textarea').focus()");
 await screenshot('qualifications-appointment-controls');
 await run("smoke.click('Revoke','.qualification-detail button')");
 await wait("document.querySelector('dialog[open]')");
 await run("smoke.click('Revoke appointment','.dialog-footer button')");
 await wait("document.querySelector('.qualification-detail')?.textContent.includes('Appointment: revoked')");
 assert.equal(await run("smoke.qualification.rows[0].status"),'submitted','Revoking Daniella does not approve the pending applicant');
 await screenshot('qualifications-admin');
 await run("document.querySelector('.qualification-detail-body').scrollTop=document.querySelector('.qualification-detail-body').scrollHeight");
 await screenshot('qualifications-information-visible');
 await run("document.querySelector('.qualification-history').scrollIntoView({block:'start'})");
 await screenshot('qualifications-history-fields');
 await run("smoke.qualification.actor={userId:2,admin:false,reviewer:true}; smoke.click('Refresh','.qualification-heading button')");
 await wait("!document.querySelector('.qualification-workspace')?.textContent.includes('Manage clinic reviewers')");
 await run("smoke.click('Rachelle Demo','.qualification-list button')");
 await wait("document.querySelector('.qualification-detail')?.textContent.includes('Clinic assessment')");
 assert.equal(await run("Array.from(document.querySelectorAll('.qualification-detail input,.qualification-detail textarea,.qualification-detail select')).every(field=>field.disabled)"),true,'Submitted assessments are read-only before Start review');
 assert.equal(await run("document.querySelector('.qualification-detail-actions .qualification-toolbar').textContent.trim()"),'Start review','Starting review is the only review action for submitted applications');
 assert.equal(await run("document.querySelector('.qualification-detail input[type=file]')===null"),true,'Reviewers cannot attach evidence before starting review');
 await run("smoke.click('Start review','.qualification-detail button')");
 await wait("document.querySelector('.qualification-detail-heading').textContent.includes('Under review') && !document.querySelector('.qualification-detail-actions button').disabled");
 assert.equal(await run("smoke.qualification.rows[0].assessment"),null,'Starting review does not save assessment fields');
 assert.equal(await run("Array.from(document.querySelectorAll('.qualification-detail input[type=checkbox]')).every(field=>!field.disabled)"),true,'Assessment editing unlocks after Start review');
 assert.equal(await run("Array.from(document.querySelectorAll('.qualification-detail button')).some(button=>button.textContent==='Start review')"),false,'An active review cannot be started again');
 for(let index=0;index<10;index++)await run(`document.querySelectorAll('.qualification-detail input[type=checkbox]')[${index}].click()`);
 for(const [title,value] of [['Assessor','Synthetic Clinic Assessor'],['Assessment date','2026-11-24'],['Training or assessment method','Campus practical assessment'],['Assessment notes','Synthetic demo data: observed return demonstration.'],['Decision rationale','Synthetic demo data: all campus competencies passed.']]){
  await run(`smoke.fill([...document.querySelectorAll('.qualification-detail label')].find(l=>l.textContent.startsWith(${JSON.stringify(title)})).querySelector('input,textarea'),${JSON.stringify(value)})`);
 }
 await run("smoke.fill([...document.querySelectorAll('.qualification-detail label')].find(l=>l.textContent.startsWith('Assessment result')).querySelector('select'),'passed')");
 await run("smoke.click('Save assessment','.qualification-detail button')");
 await wait("document.querySelector('.qualification-feedback').textContent.includes('Assessment saved')");
 assert.equal(await run("[...document.querySelectorAll('.qualification-detail label')].find(l=>l.textContent.startsWith('Decision rationale')).querySelector('textarea').value"),'Synthetic demo data: all campus competencies passed.','Saving assessment retains the pending decision rationale');
 await run("smoke.click('Approve appointment','.qualification-detail button')");await wait("document.querySelector('dialog[open]')");
 await run("smoke.click('Approve responder appointment','.dialog-footer button')");
 await wait("smoke.qualification.rows[0].status==='approved' && document.querySelector('.qualification-detail')?.textContent.includes('Appointment: active')");
 const approve=await run("smoke.qualification.calls.filter(c=>c.method==='PATCH').map(c=>JSON.parse(c.body)).find(c=>c.action==='approve')");
 assert.equal(approve.assessment.result,'passed');assert.equal(Object.values(approve.assessment.competencies).every(Boolean),true);assert.equal(approve.revision,3);
 assert.deepEqual(await run("smoke.qualification.calls.filter(call=>call.method==='PATCH'&&call.path.endsWith('/applications/102')).map(call=>JSON.parse(call.body).action)"),['start_review','save_assessment','approve'],'Clinic actions follow the required review sequence');
 for(const [width,height] of [[1366,768],[1024,720],[620,900]]) {
  await resize(width,height);
  const fits=await run("document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1");
  assert.equal(fits,true,`Qualification workspace fits ${width}x${height}`);
  await run("document.querySelector('.qualification-workspace').scrollTop=0; document.querySelector('.app-main').scrollTop=0");
  const clearHeader=await run("document.querySelector('.qualification-heading').getBoundingClientRect().top >= document.querySelector('.tb').getBoundingClientRect().bottom-1");
  assert.equal(clearHeader,true,`Wrapped header does not obscure qualifications at ${width}px`);
 }
 await resize(1366,768);
 await screenshot('qualifications-review');
 await verifyQualificationStability(run,wait,resize,screenshot,setReducedMotion);
 console.log('Responder qualification oversight, revocation, clinic assessment and responsive layouts passed.');
}
