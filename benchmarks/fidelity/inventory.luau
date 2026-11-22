-- A small inventory with names and control flow worth reconstructing.
return function(seed)
    local balance = seed + 10
    local history = {}
    for index = 1, 6 do
        local amount = (seed + index * 3) % 9
        if amount % 2 == 0 then
            balance += amount
        else
            balance -= amount
        end
        history[#history + 1] = tostring(balance)
        if balance > 35 then
            break
        end
    end
    return balance, table.concat(history, ","), nil, #history
end
