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




class VTOQueue {
  constructor(concurrency = 1) {
    this.queue = [];
    this.processing = 0;
    this.concurrency = concurrency;
  }

  addJob(job) {
    this.queue.push({ ...job, retries: job.retries || 0 });
    console.log(`[VTO Queue] New job, queue size: ${this.queue.length}, processing: ${this.processing}`);
    this.processNext();
  }

  async processNext() {
    if (this.processing >= this.concurrency) return;
    if (this.queue.length === 0) {
      if (this.processing === 0) console.log("[VTO Queue] Khali, wait...");
      return;
    }

    this.processing++;
    const job = this.queue.shift();
    console.log(`[VTO Queue] Job start, bache: ${this.queue.length}`);

    try {
      const result = await job.task();
      await job.onDone(result);
    } catch (e) {
      console.error("[VTO Queue] Fail:", e.message, e.stack);
      
      // Retry 1 time if HF space slept
      if (job.retries < 1 && (e.message.includes('Queue') || e.message.includes('Space') || e.message.includes('An error'))) {
        console.log("[VTO Queue] Retrying job...");
        this.queue.unshift({ ...job, retries: job.retries + 1 });
      } else {
        if (job.onError) await job.onError(e);
      }
    } finally {
      this.processing--;
      setTimeout(() => this.processNext(), 1000); // 1 sec gap for HF
    }
  }
}
module.exports = new VTOQueue();