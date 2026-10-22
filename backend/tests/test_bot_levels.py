import unittest
from types import SimpleNamespace
from unittest.mock import Mock
import chess
from bot_levels import choose_bot_move, beginner_error_rate


class BeginnerBotTest(unittest.TestCase):
    def test_beginner_errors_and_native_strength(self):
        board=chess.Board()
        best=chess.Move.from_uci('e2e4')
        engine=Mock()
        engine.play.return_value=SimpleNamespace(move=best)
        rng=Mock()
        rng.random.return_value=0
        rng.choice.side_effect=lambda choices: choices[0]
        for elo in (200,400,800,1310):
            move=choose_bot_move(engine,board,elo,'test',rng)
            self.assertIn(move,board.legal_moves)
            self.assertNotEqual(move,best)
            self.assertEqual(engine.configure.call_args.args[0]['UCI_Elo'],1320)
        rng.random.return_value=1
        self.assertEqual(choose_bot_move(engine,board,200,'test',rng),best)
        rng.reset_mock()
        self.assertEqual(choose_bot_move(engine,board,2400,'test',rng),best)
        self.assertEqual(engine.configure.call_args.args[0]['UCI_Elo'],2400)
        rng.random.assert_not_called()
        self.assertGreater(beginner_error_rate(200),beginner_error_rate(800))
        self.assertGreater(beginner_error_rate(800),beginner_error_rate(1310))
        self.assertEqual(beginner_error_rate(1320),0)

    def test_check_promotion_and_forced_positions(self):
        rng=Mock()
        rng.random.return_value=0
        rng.choice.side_effect=lambda choices: choices[-1]
        for fen in ('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1',
                    '7k/P7/8/8/8/8/8/K7 w - - 0 1'):
            board=chess.Board(fen)
            engine=Mock()
            engine.play.return_value=SimpleNamespace(move=list(board.legal_moves)[0])
            move=choose_bot_move(engine,board,200,'special',rng)
            self.assertIn(move,board.legal_moves)
        forced=chess.Board('7k/8/5K2/8/8/8/8/6R1 b - - 0 1')
        self.assertEqual(len(list(forced.legal_moves)),1)
        engine=Mock()
        self.assertIn(choose_bot_move(engine,forced,200,'forced'),forced.legal_moves)
        engine.play.assert_not_called()
        mate=chess.Board('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1')
        self.assertIsNone(choose_bot_move(engine,mate,200,'mate'))

    def test_invalid_target_and_engine_move(self):
        engine=Mock()
        board=chess.Board()
        for elo in (199,3191):
            with self.assertRaises(ValueError):choose_bot_move(engine,board,elo,'invalid')
        engine.play.return_value=SimpleNamespace(move=chess.Move.from_uci('a1a8'))
        with self.assertRaises(RuntimeError):choose_bot_move(engine,board,200,'invalid-move')
