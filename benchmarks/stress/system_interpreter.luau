-- Small stack machine with jumps, nested calls, shared globals and nil results.
return function(seed)
    local total = seed + 7
    local events = {}
    local function mark(tag, value)
        events[#events + 1] = tag .. ":" .. tostring(value)
        return value
    end
    local globals = {seed, 0, 0}
    local programs = {
        {
            {"push", 1}, {"store", 2}, {"push", 0}, {"store", 3},
            {"load", 3}, {"push", 1}, {"add"}, {"store", 3},
            {"load", 2}, {"load", 3}, {"call", 2}, {"store", 2},
            {"load", 3}, {"push", 5}, {"lt"}, {"jumptrue", 5},
            {"load", 2}, {"return"},
        },
        {
            {"arg", 1}, {"arg", 2}, {"add"}, {"load", 1}, {"add"},
            {"push", 2}, {"mod"}, {"nonzero"}, {"jumptrue", 14},
            {"arg", 1}, {"arg", 2}, {"mul"}, {"return"},
            {"arg", 1}, {"arg", 2}, {"add"}, {"push", 3}, {"add"}, {"return"},
        },
    }
    local calls = 0
    local function execute(programId, ...)
        calls += 1
        local invocation = calls
        local args = table.pack(...)
        local stack, size, pc = {}, 0, 1
        local function push(value)
            size += 1
            stack[size] = value
        end
        local function pop()
            local value = stack[size]
            stack[size] = nil
            size -= 1
            return value
        end
        local steps = 0
        while true do
            steps += 1
            if steps > 300 then error("step budget") end
            local instruction = programs[programId][pc]
            if not instruction then error("invalid program counter") end
            local op, param = instruction[1], instruction[2]
            mark("op" .. invocation, pc)
            pc += 1
            if op == "push" then
                push(param)
            elseif op == "arg" then
                push(args[param])
            elseif op == "load" then
                push(globals[param])
            elseif op == "store" then
                globals[param] = pop()
            elseif op == "add" then
                local b, a = pop(), pop()
                push(a + b)
            elseif op == "mul" then
                local b, a = pop(), pop()
                push(a * b)
            elseif op == "mod" then
                local b, a = pop(), pop()
                push(a % b)
            elseif op == "nonzero" then
                push(pop() ~= 0)
            elseif op == "lt" then
                local b, a = pop(), pop()
                push(a < b)
            elseif op == "jumptrue" then
                if pop() then pc = param end
            elseif op == "call" then
                local b, a = pop(), pop()
                local value, absent = execute(param, a, b, nil)
                if absent ~= nil then error("bad arity") end
                push(value)
            elseif op == "return" then
                return pop(), nil, size
            else
                error("unknown instruction")
            end
        end
    end
    for run = 1, 3 do
        globals[1] = seed + run
        local packed = table.pack(pcall(execute, 1))
        mark("call", packed.n)
        mark("ok", packed[1])
        if not packed[1] then error("machine failed") end
        total += packed[2] + packed[4]
        mark("result", packed[2])
    end
    mark("calls", calls)
    return total, table.concat(events, ","), nil, #events
end
