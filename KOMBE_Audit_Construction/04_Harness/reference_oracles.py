"""Oracles de spécification indépendants. Pas une implémentation de KÓMBE."""
from calendar import monthrange
from fractions import Fraction
import hashlib
MAX_SAFE=2**53-1

def money(value):
    if type(value) is not int or not 0 <= value <= MAX_SAFE:
        raise ValueError('Montant entier sûr positif ou nul requis')
    return value

def rotation(n, contribution):
    if type(n) is not int or n < 2: raise ValueError('Au moins deux membres')
    money(contribution)
    if contribution==0: raise ValueError('Cotisation positive')
    pot=money(n*contribution)
    return {'round_pot':pot,'rounds':n,'cycle_total':money(n*pot)}

def remaining(due,validated,active_reserved):
    for v in (due,validated,active_reserved):money(v)
    if validated>active_reserved or active_reserved>due: raise ValueError('Réservation incohérente')
    return {'remaining_due':due-validated,'available_to_declare':due-active_reserved}

def reconciliation(contributions,net_disbursements,group_fees,disputed=False):
    for v in (contributions,net_disbursements,group_fees):money(v)
    gap=contributions-net_disbursements-group_fees
    return {'gap':gap,'can_close_if_obligations_complete':gap==0 and not disputed}

def vote_result(electorate,yes,no,abstain,quorum_num=2,quorum_den=3):
    vals=(electorate,yes,no,abstain,quorum_num,quorum_den)
    if any(type(x) is not int or x<0 for x in vals) or electorate==0 or quorum_den==0:
        raise ValueError('Électorat et votes invalides')
    if quorum_num>quorum_den or yes+no+abstain>electorate:raise ValueError('Hors limites')
    q=Fraction(electorate*quorum_num,quorum_den)
    threshold=(q.numerator+q.denominator-1)//q.denominator
    return {'quorum':threshold,'approved':yes+no+abstain>=threshold and yes+no>0 and yes>no}

def due_date(year,month,day):
    if type(day) is not int or day<1 or day>31:raise ValueError('Jour invalide')
    return f'{year:04d}-{month:02d}-{min(day,monthrange(year,month)[1]):02d}'

def csv_text(value):
    """Neutralisation référence d'un champ texte ; chiffres typés traités ailleurs."""
    if not isinstance(value,str):raise ValueError('Texte requis')
    stripped=value.lstrip(' \t\r\n')
    return "'"+value if stripped.startswith(('=','+','-','@')) or value.startswith(('\t','\r','\n')) else value

def verify_bytes(data,expected):
    return hashlib.sha256(data).hexdigest()==expected
