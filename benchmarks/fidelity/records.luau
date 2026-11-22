-- Record operations and a method invocation on a stable receiver.
return function(seed)
    local account = {balance = seed + 12, count = 0, history = {}}
    function account:deposit(amount)
        self.balance += amount
        self.count += 1
        self.history[self.count] = tostring(self.balance)
        return self.balance
    end
    for index = 1, 4 do
        account:deposit((seed + index) % 5)
    end
    if account.balance > 20 then
        account:deposit(-2)
    end
    return account.balance, table.concat(account.history, ","), nil, account.count
end
