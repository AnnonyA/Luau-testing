//! Optional, strictly bounded synthesis of a fixed-count loop for consecutive
//! method calls of the form `receiver:method((value + n) % modulus)` for
//! n = 1..N. This reconstructs an equivalent presentation, not original source.
//!
//! Only local receiver/value reads and a literal positive integer modulus are
//! accepted. Each read, arithmetic operation, lookup and call still happens on
//! every iteration in the original order; the new induction variable cannot be
//! observed by the pre-existing code. Unknown shapes are left untouched.

use crate::{BinaryOperation, Block, Comment, Literal, Local, MethodCall, NumericFor, RValue, RcLocal, Statement};

pub(crate) const MARKER: &str = "equivalent fixed-count call loop synthesized; original loop unknown";
const MIN_CALLS: usize = 4;
const MAX_CALLS: usize = 8;
const MAX_LOOPS: usize = 64;

struct Shape<'a> {
    call: &'a MethodCall,
    receiver: &'a RcLocal,
    operand: &'a RcLocal,
    modulus: f64,
}

fn shape(statement: &Statement, index: usize) -> Option<Shape<'_>> {
    let Statement::MethodCall(call) = statement else { return None };
    let RValue::Local(receiver) = call.value.as_ref() else { return None };
    let [RValue::Binary(modulo)] = call.arguments.as_slice() else { return None };
    if modulo.operation != BinaryOperation::Mod { return None; }
    let RValue::Literal(Literal::Number(modulus)) = modulo.right.as_ref() else { return None };
    if !modulus.is_finite() || *modulus < 1.0 || *modulus > 65535.0 || modulus.fract() != 0.0 { return None; }
    let RValue::Binary(add) = modulo.left.as_ref() else { return None };
    if add.operation != BinaryOperation::Add { return None; }
    let RValue::Local(operand) = add.left.as_ref() else { return None };
    let RValue::Literal(Literal::Number(number)) = add.right.as_ref() else { return None };
    if number.to_bits() != (index as f64).to_bits() { return None; }
    Some(Shape { call, receiver, operand, modulus: *modulus })
}

fn candidate(statements: &[Statement]) -> Option<(usize, MethodCall)> {
    let first = shape(statements.first()?, 1)?;
    let mut count = 1;
    for statement in statements.iter().skip(1).take(MAX_CALLS - 1) {
        let Some(next) = shape(statement, count + 1) else { break };
        if first.receiver != next.receiver || first.operand != next.operand
            || first.call.method != next.call.method || first.modulus.to_bits() != next.modulus.to_bits()
        { break; }
        count += 1;
    }
    if count < MIN_CALLS { return None; }
    // Refuse a longer continuation rather than claiming a partial sequence.
    if count == MAX_CALLS && statements.get(count).is_some_and(|s| shape(s, count + 1).is_some()) {
        return None;
    }
    Some((count, first.call.clone()))
}

/// Called only under the explicit experimental loop-synthesis option, after
/// temp inlining but before final naming and register-limit checks.
pub fn reroll_method_calls(body: &mut Block) {
    let usage = crate::inline_temps::collect_usage(body);
    let mut suffix = 0;
    let index_name = loop {
        let name = if suffix == 0 { "tovekIndex".to_string() } else { format!("tovekIndex{suffix}") };
        if !usage.keys().any(|local| local.0.lock().0.as_deref() == Some(name.as_str())) { break name; }
        suffix += 1;
    };
    let mut remaining = MAX_LOOPS;
    walk(body, &index_name, &mut remaining);
}

fn walk(body: &mut Block, index_name: &str, remaining: &mut usize) {
    for statement in &mut body.0 {
        let mut closures = Vec::new();
        crate::inline_temps::collect_closures_in_statement(statement, &mut |c| closures.push(c.function.clone()));
        for closure in closures { walk(&mut closure.lock().body, index_name, remaining); }
        match statement {
            Statement::If(s) => { walk(&mut s.then_block.lock(), index_name, remaining); walk(&mut s.else_block.lock(), index_name, remaining); }
            Statement::While(s) => walk(&mut s.block.lock(), index_name, remaining),
            Statement::Repeat(s) => walk(&mut s.block.lock(), index_name, remaining),
            Statement::NumericFor(s) => walk(&mut s.block.lock(), index_name, remaining),
            Statement::GenericFor(s) => walk(&mut s.block.lock(), index_name, remaining),
            _ => {}
        }
    }
    let mut position = 0;
    while position < body.0.len() && *remaining > 0 {
        let Some((count, mut call)) = candidate(&body.0[position..]) else { position += 1; continue };
        let counter = RcLocal::new(Local::new(Some(index_name.to_string())));
        let RValue::Binary(modulo) = &mut call.arguments[0] else { unreachable!() };
        let RValue::Binary(add) = modulo.left.as_mut() else { unreachable!() };
        *add.right = RValue::Local(counter.clone());
        let loop_body = Block(vec![Statement::MethodCall(call)]);
        let new_loop = NumericFor::new(Literal::Number(1.0).into(), Literal::Number(count as f64).into(),
            Literal::Number(1.0).into(), counter, loop_body);
        body.0.splice(position..position + count, [Comment::new(MARKER.to_string()).into(), new_loop.into()]);
        position += 2;
        *remaining -= 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Binary, BinaryOperation};

    fn call(receiver: &RcLocal, operand: &RcLocal, method: &str, index: f64, modulus: f64) -> Statement {
        let add = Binary::new(RValue::Local(operand.clone()), Literal::Number(index).into(), BinaryOperation::Add);
        let arg = Binary::new(add.into(), Literal::Number(modulus).into(), BinaryOperation::Mod);
        Statement::MethodCall(MethodCall::new(RValue::Local(receiver.clone()), method.to_owned(), vec![arg.into()]))
    }
    fn locals() -> (RcLocal, RcLocal) {
        (RcLocal::new(Local::new(Some("account".into()))), RcLocal::new(Local::new(Some("seed".into()))))
    }
    fn sequence(receiver: &RcLocal, operand: &RcLocal) -> Block {
        Block((1..=4).map(|i| call(receiver, operand, "deposit", i as f64, 5.0)).collect())
    }
    #[test]
    fn equivalent_call_sequence_becomes_labelled_loop() {
        let (receiver, operand) = locals();
        let mut block = sequence(&receiver, &operand);
        reroll_method_calls(&mut block);
        assert_eq!(block.0.len(), 2);
        assert!(block.to_string().contains(MARKER));
        assert!(block.to_string().contains("account:deposit((seed + tovekIndex) % 5)"));
        assert!(matches!(block.0[1], Statement::NumericFor(_)));
    }
    #[test]
    fn refuses_short_or_non_identical_sequences() {
        let (receiver, operand) = locals();
        for variant in 0..5 {
            let mut block = sequence(&receiver, &operand);
            match variant {
                0 => { block.0.pop(); }
                1 => block.0[2] = call(&receiver, &operand, "withdraw", 3.0, 5.0),
                2 => block.0[2] = call(&receiver, &operand, "deposit", 5.0, 5.0),
                3 => block.0[2] = call(&receiver, &operand, "deposit", 3.0, 7.0),
                _ => block.0[2] = call(&RcLocal::new(Local::new(Some("other".into()))), &operand, "deposit", 3.0, 5.0),
            }
            let expected = block.to_string();
            reroll_method_calls(&mut block);
            assert_eq!(block.to_string(), expected);
        }
    }
    #[test]
    fn refuses_invalid_modulus_and_more_than_eight_calls() {
        let (receiver, operand) = locals();
        for modulus in [0.0, -1.0, f64::NAN, f64::INFINITY, 2.5] {
            let mut block = Block((1..=4).map(|i| call(&receiver, &operand, "deposit", i as f64, modulus)).collect());
            let expected = block.to_string();
            reroll_method_calls(&mut block);
            assert_eq!(block.to_string(), expected);
        }
        let mut block = Block((1..=9).map(|i| call(&receiver, &operand, "deposit", i as f64, 5.0)).collect());
        let expected = block.to_string();
        reroll_method_calls(&mut block);
        assert_eq!(block.to_string(), expected);
    }
    #[test]
    fn induction_variable_does_not_shadow_an_existing_binding() {
        let (receiver, _) = locals();
        let operand = RcLocal::new(Local::new(Some("tovekIndex".into())));
        let mut block = sequence(&receiver, &operand);
        reroll_method_calls(&mut block);
        assert!(block.to_string().contains("tovekIndex1"));
    }
}
