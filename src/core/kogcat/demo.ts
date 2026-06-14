import { SynthesizedReview } from './reviewSynthesis'

export const KOGCAT_DEMO_TEXT =
  '我们已经在这个方案上投入了三个月，现在换方向太可惜了，再坚持一下肯定能成。而且我注意到的所有信号都在说明它会成功。'

export const KOGCAT_DEMO_REVIEW: SynthesizedReview = {
  summary:
    '这段话已经有明确判断，但判断主要靠投入成本和支持性信号撑住，缺少退出条件和反例。',
  mode: 'claim',
  next_step: '补一句会让你改变判断的证据，和一个明确停止继续投入的条件。',
  points: [
    {
      stance: 'oppose',
      judgment: '先把“三个月投入”从继续投入的理由里拿掉。',
      why: '已经投入的成本不能证明方向仍然值得；它只说明放弃会疼。真正需要判断的是从今天继续投入，预期回报是否仍高于换方向。',
      refs: [],
    },
    {
      stance: 'oppose',
      judgment: '“所有信号都说明会成功”更像确认偏误，而不是证据总结。',
      why: '如果只记录支持性信号，方案会越看越稳。更有用的写法是列出一个反向信号：什么迹象出现时，说明你现在的判断错了。',
      refs: [],
    },
    {
      stance: 'bridge',
      judgment: '把“再坚持一下”改成可验收的下一次实验。',
      why: '继续不是问题，问题是无期限继续。给它一个时间盒、指标和退出线，判断才不会变成计划感。',
      refs: [],
    },
  ],
}
