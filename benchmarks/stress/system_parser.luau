-- Recursive-descent parser with precedence, backtracking and protected errors.
return function(seed)
    local total = seed + 7
    local events = {}
    local function mark(tag, value)
        events[#events + 1] = tag .. ":" .. tostring(value)
        return value
    end
    local function evaluate(text)
        local pos, depth = 1, 0
        local expression
        local function skip()
            while text:sub(pos, pos) == " " do pos += 1 end
        end
        local function accept(ch)
            skip()
            if text:sub(pos, pos) == ch then
                mark("accept", ch .. pos)
                pos += 1
                return true
            end
            return false
        end
        local function atom()
            depth += 1
            if depth > 20 then error("depth") end
            skip()
            if accept("-") then
                local value = -atom()
                depth -= 1
                return value
            end
            if accept("(") then
                local value = expression()
                if not accept(")") then error("missing close") end
                depth -= 1
                return value
            end
            local start = pos
            while text:sub(pos, pos):match("%d") do pos += 1 end
            if pos == start then error("number") end
            local value = tonumber(text:sub(start, pos - 1))
            mark("num", value)
            depth -= 1
            return value
        end
        local function term()
            local value = atom()
            while true do
                if accept("*") then
                    local rhs = atom()
                    value *= rhs
                    mark("mul", value)
                elseif accept("/") then
                    local rhs = atom()
                    if rhs == 0 then error("zero division") end
                    value = math.floor(value / rhs)
                    mark("div", value)
                else break end
            end
            return value
        end
        expression = function()
            local value = term()
            while true do
                if accept("+") then
                    value += term()
                    mark("plus", value)
                elseif accept("-") then
                    value -= term()
                    mark("minus", value)
                else break end
            end
            return value
        end
        local value = expression()
        skip()
        if pos <= #text then error("trailing input") end
        return value, nil, pos
    end
    local expressions = {
        "1 + 2 * (3 + 4)", "- (4 + 5) * 2", "8 / 2 - 7 + 3",
        tostring(seed % 11) .. " * (2 + 3) - 1", "1 + (2 * )", "9 / (3 - 3)",
        "2*(3+4*(5-1))", "4 - -3 + (6 / 2)", "12 + 4 tail",
    }
    for i, text in expressions do
        local result = table.pack(pcall(evaluate, text))
        mark("parsed" .. i, result[1])
        mark("arity" .. i, result.n)
        if result[1] then
            total += result[2] * i + result[4]
        else
            total -= i
        end
    end
    return total, table.concat(events, ","), nil, #events
end
