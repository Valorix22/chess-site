"""Beginner difficulty below Stockfish's native UCI_Elo range.

These targets are illustrative, not calibrated ratings. Lower targets blend
Stockfish's minimum-strength play with increasingly frequent random legal moves.
"""
import random
import chess.engine

MIN_ELO = 200
NATIVE_MIN_ELO = 1320
MAX_ELO = 3190


def beginner_error_rate(elo):
    return .95 * max(0, (NATIVE_MIN_ELO - elo) / (NATIVE_MIN_ELO - MIN_ELO)) ** 1.25


def choose_bot_move(engine, board, elo, game, rng=None):
    if not MIN_ELO <= elo <= MAX_ELO:
        raise ValueError('Unsupported bot difficulty')
    legal = list(board.legal_moves)
    if not legal:
        return None
    if len(legal) == 1:
        return legal[0]
    engine.configure({'UCI_LimitStrength': True, 'UCI_Elo': max(NATIVE_MIN_ELO, elo)})
    move = engine.play(board, chess.engine.Limit(time=.25), game=game).move
    if move not in legal:
        raise RuntimeError('Stockfish did not return a legal move')
    rng = rng or random
    if elo < NATIVE_MIN_ELO and rng.random() < beginner_error_rate(elo):
        return rng.choice([candidate for candidate in legal if candidate != move])
    return move
