import json
from reference_oracles import rotation,remaining,vote_result,reconciliation
print(json.dumps({'target':'reference_only','rotation':rotation(10,5000),'partial':remaining(5000,2000,5000),'vote_pass':vote_result(10,4,2,1),'vote_tie':vote_result(10,3,3,1),'reconciliation':reconciliation(50000,49000,1000)},ensure_ascii=False,indent=2))
