// class VTOQueue {
//   constructor() {
//     this.queue = [];
//     this.processing = false;
//   }

//   addJob(job) {
//     this.queue.push(job);
//     console.log(`[VTO Queue] New job, queue size: ${this.queue.length}`);
//     if (!this.processing) {
//       this.processNext();
//     }
//   }

//   async processNext() {
//     if (this.queue.length === 0) {
//       this.processing = false;
//       console.log("[VTO Queue] Queue khali, wait kar raha hu");
//       return;
//     }

//     this.processing = true;
//     const job = this.queue.shift();
//     console.log(`[VTO Queue] Job start, bache: ${this.queue.length}`);

//     try {
//       const result = await job.task();
//       await job.onDone(result);
//     } catch (e) {
//       console.error("[VTO Queue] Job fail:", e.message);
//       console.error(e.stack);
//       if (job.onError) {
//         await job.onError(e);
//       }
//     }

//     setTimeout(() => this.processNext(), 3000);
//   }
// }

// module.exports = new VTOQueue();

// services/vtoQueue.js
class VTOQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }
  addJob(job) {
    this.queue.push(job);
    console.log(`[VTO Queue] New job, queue size: ${this.queue.length}`);
    if (!this.processing) this.processNext();
  }
  async processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      console.log("[VTO Queue] Khali, wait...");
      return;
    }
    this.processing = true;
    const job = this.queue.shift();
    console.log(`[VTO Queue] Job start, bache: ${this.queue.length}`);
    try {
      const result = await job.task();
      await job.onDone(result);
    } catch (e) {
      console.error("[VTO Queue] Fail:", e.message);
      if (job.onError) await job.onError(e);
    }
    setTimeout(() => this.processNext(), 500);
  }
}
module.exports = new VTOQueue();