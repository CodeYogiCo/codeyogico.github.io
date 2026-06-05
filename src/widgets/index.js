import NDCGCalculator from './NDCGCalculator.jsx'
import MRRCalculator from './MRRCalculator.jsx'
import PrecisionRecallCalculator from './PrecisionRecallCalculator.jsx'
import KVCacheCalculator from './KVCacheCalculator.jsx'
import LSHMatchCalculator from './LSHMatchCalculator.jsx'
import ScannPipelineDiagram from './ScannPipelineDiagram.jsx'
import ScannPartitionDiagram from './ScannPartitionDiagram.jsx'
import ScannErrorDiagram from './ScannErrorDiagram.jsx'

export const widgets = {
  'ndcg-calc': NDCGCalculator,
  'mrr-calc': MRRCalculator,
  'precision-recall-calc': PrecisionRecallCalculator,
  'kv-cache-calc': KVCacheCalculator,
  'lsh-match-calc': LSHMatchCalculator,
  'scann-pipeline': ScannPipelineDiagram,
  'scann-partition': ScannPartitionDiagram,
  'scann-error': ScannErrorDiagram,
}
