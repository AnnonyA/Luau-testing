-- Mutable capture and a distinct immutable capture.
return function(seed)
    local balance = seed
    local history = {}
    local increment = seed % 4 + 1
    local function update(amount)
        balance += amount * increment
        history[#history + 1] = tostring(balance)
        return balance
    end
    local first = update(2)
    local second = update(3)
    if first > second then
        balance -= first
    else
        balance += second
    end
    return balance, table.concat(history, ","), nil, #history
end
