/**
 * User-controlled request limits around the inference seam. Global
 * concurrency + per-background-task request caps. Waiting requests can be
 * aborted; failed/aborted waits do not consume a background job's budget.
 * No automatic model downgrade or background retry on quota errors.
 */
export class InferenceLimits {
  #active = 0;
  #waiting = [];
  #counts = new Map();
  #enabled = new Map();
  constructor({maxConcurrent = 2, maxBackgroundCalls = 5, maxQueue = 30} = {}) {
    for (const [name, value] of Object.entries({maxConcurrent,maxBackgroundCalls,maxQueue})) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
    }
    this.maxConcurrent=maxConcurrent;
    this.maxBackgroundCalls=maxBackgroundCalls;
    this.maxQueue=maxQueue;
  }
  setRoleEnabled(role, enabled) {
    if (typeof role !== 'string' || !role) throw new Error('Role name required');
    if (typeof enabled !== 'boolean') throw new Error('Role state must be boolean');
    this.#enabled.set(role,enabled);
  }
  isRoleEnabled(role) {return this.#enabled.get(role)!==false;}
  get stats() {return {active:this.#active,waiting:this.#waiting.length};}
  getTaskCallCount(taskId) {return this.#counts.get(taskId)??0;}
  forgetTask(taskId) {this.#counts.delete(taskId);}
  #drain() {
    while (this.#active < this.maxConcurrent && this.#waiting.length) {
      const next=this.#waiting.shift();
      if(next.signal?.aborted){next.reject(next.signal.reason??new Error('Request aborted'));continue;}
      this.#active++;
      next.resolve();
    }
  }
  #acquire(signal) {
    if(signal?.aborted) return Promise.reject(signal.reason??new Error('Request aborted'));
    if(this.#active<this.maxConcurrent && this.#waiting.length===0){this.#active++;return Promise.resolve();}
    if(this.#waiting.length>=this.maxQueue) return Promise.reject(new Error('Inference queue is full'));
    return new Promise((resolve,reject)=>{
      const waiter={resolve,reject,signal};
      const abort=()=>{
        const at=this.#waiting.indexOf(waiter);
        if(at!==-1){this.#waiting.splice(at,1);reject(signal.reason??new Error('Request aborted'));}
        signal?.removeEventListener('abort',abort);
      };
      waiter.resolve=()=>{signal?.removeEventListener('abort',abort);resolve();};
      waiter.reject=err=>{signal?.removeEventListener('abort',abort);reject(err);};
      this.#waiting.push(waiter);
      signal?.addEventListener('abort',abort,{once:true});
    });
  }
  async run({role='teacher',backgroundTaskId,signal}={},fn) {
    if(typeof fn!=='function') throw new Error('Inference function required');
    if(!this.isRoleEnabled(role)) throw new Error(`Inference disabled for role: ${role}`);
    // Precheck: the real count check occurs after acquiring the gate.
    if(backgroundTaskId !== undefined && this.getTaskCallCount(backgroundTaskId)>=this.maxBackgroundCalls)
      throw new Error(`Background task request cap reached: ${backgroundTaskId}`);
    await this.#acquire(signal);
    try {
      if(signal?.aborted) throw signal.reason??new Error('Request aborted');
      if(!this.isRoleEnabled(role)) throw new Error(`Inference disabled for role: ${role}`);
      if(backgroundTaskId !== undefined){
        const used=this.getTaskCallCount(backgroundTaskId);
        if(used>=this.maxBackgroundCalls) throw new Error(`Background task request cap reached: ${backgroundTaskId}`);
        this.#counts.set(backgroundTaskId,used+1);
      }
      return await fn();
    } finally {
      this.#active--;
      this.#drain();
    }
  }
}
