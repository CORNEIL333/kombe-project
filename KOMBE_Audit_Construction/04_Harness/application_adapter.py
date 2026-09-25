"""À implémenter par C28 contre un environnement fictif KÓMBE autorisé."""
import sys,json
request=json.load(sys.stdin)
print(json.dumps({'scenario_id':request.get('id'),'target':'unconfigured','status':'BLOCKED','reason':'Aucun logiciel KÓMBE raccordé'}))
sys.exit(2)
