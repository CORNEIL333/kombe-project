import unittest,hashlib,tempfile,json
from pathlib import Path
from reference_oracles import *
from run_harness import check,strict_equal
from verify_gate import verify

class ReferenceTests(unittest.TestCase):
    def test_rotation(self):self.assertEqual(rotation(10,5000),{'round_pot':50000,'rounds':10,'cycle_total':500000})
    def test_no_float(self):
        with self.assertRaises(ValueError):money(5000.0)
    def test_no_bool_money(self):
        with self.assertRaises(ValueError):money(True)
    def test_no_negative(self):
        with self.assertRaises(ValueError):money(-1)
    def test_overflow(self):
        with self.assertRaises(ValueError):rotation(10,MAX_SAFE)
    def test_zero_contribution(self):
        with self.assertRaises(ValueError):rotation(10,0)
    def test_partial(self):self.assertEqual(remaining(5000,2000,5000),{'remaining_due':3000,'available_to_declare':0})
    def test_over_reservation(self):
        with self.assertRaises(ValueError):remaining(5000,2000,6000)
    def test_under_reservation(self):
        with self.assertRaises(ValueError):remaining(5000,3000,2000)
    def test_vote_yes(self):self.assertEqual(vote_result(10,4,2,1),{'quorum':7,'approved':True})
    def test_vote_tie(self):self.assertFalse(vote_result(10,3,3,1)['approved'])
    def test_vote_abstain(self):self.assertFalse(vote_result(10,0,0,10)['approved'])
    def test_vote_no_quorum(self):self.assertFalse(vote_result(10,6,0,0)['approved'])
    def test_vote_count_overflow(self):
        with self.assertRaises(ValueError):vote_result(10,11,0,0)
    def test_leap(self):self.assertEqual(due_date(2028,2,31),'2028-02-29')
    def test_not_leap(self):self.assertEqual(due_date(2027,2,31),'2027-02-28')
    def test_gap(self):self.assertEqual(reconciliation(50000,48000,1000)['gap'],1000)
    def test_disputed_close(self):self.assertFalse(reconciliation(50000,49000,1000,True)['can_close_if_obligations_complete'])
    def test_balanced(self):self.assertTrue(reconciliation(50000,49000,1000)['can_close_if_obligations_complete'])
    def test_csv(self):self.assertEqual(csv_text('  =1+1'),"'  =1+1")
    def test_csv_at(self):self.assertEqual(csv_text('@SUM(A1)'),"'@SUM(A1)")
    def test_csv_normal(self):self.assertEqual(csv_text('Cotisation'),'Cotisation')
    def test_tampered(self):self.assertFalse(verify_bytes(b'abc!',hashlib.sha256(b'abc').hexdigest()))
    def test_unchanged(self):self.assertTrue(verify_bytes(b'abc',hashlib.sha256(b'abc').hexdigest()))
    def test_independent_checker(self):self.assertEqual(check({'amount':4999},{'amount':5000}),['amount'])
    def test_missing_observation(self):self.assertEqual(check({},{'count':0}),['count'])
    def test_strict_bool(self):self.assertFalse(strict_equal(1,True))
    def test_gate_missing(self):
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)/'m.json';p.write_text(json.dumps({'gate':'G0','commit':'a'*40}))
            with self.assertRaises(ValueError):verify(p,Path(__file__).parent/'scenarios.json','a'*40)

if __name__=='__main__':unittest.main()
